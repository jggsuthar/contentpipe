"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  Shield,
  Layers,
  Key,
  Mail,
  UserCheck,
  CheckCircle2,
  Check,
  Loader2,
  X,
  Save,
  AlertCircle,
  FolderTree,
  FileText,
  Video,
  ListTodo,
  Calendar,
  Clock,
  Sparkles,
  Lock,
} from "lucide-react";
import {
  AccessLevel,
  TargetDateAccessLevel,
  RolePermissions,
  ContentTypeRoleConfig,
  SubmissionPermissions,
  FolderArchitectureItem,
} from "@/types/database";

interface RoleItem {
  id: string;
  name: string;
  email: string;
  role_title: string;
  assigned_content_types: string[];
  permissions: RolePermissions;
  created_at: string;
}

interface BrandItem {
  id: string;
  name: string;
  color: string | null;
  is_default: boolean;
}

interface ContentTypeSummary {
  id: string;
  brand_id?: string | null;
  brand?: {
    id: string;
    name: string;
    color: string | null;
  } | null;
  name: string;
  workflow_tasks: { id: string; task_name: string; sequence_order: number; is_hidden: boolean }[];
  misc_tasks: { id: string; task_name: string }[];
  default_folder_architecture?: FolderArchitectureItem[] | null;
}

export function RolesTab() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [contentTypes, setContentTypes] = useState<ContentTypeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  // Form Basic Info
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleTitle, setRoleTitle] = useState("");

  // Live Email Validation
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailValidation, setEmailValidation] = useState<{
    valid: boolean;
    reason?: string;
    isWorkspace?: boolean;
  } | null>(null);
  const emailDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Multi-Content-Type Assignment
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [activeConfigTypeId, setActiveConfigTypeId] = useState<string>("");
  const [configsByTypeId, setConfigsByTypeId] = useState<Record<string, ContentTypeRoleConfig>>({});

  // Submission & Alert State
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch roles, brands, and content series
  const fetchRolesAndTypes = async () => {
    try {
      setLoading(true);
      const [rolesRes, brandsRes, typesRes] = await Promise.all([
        fetch("/api/settings/roles"),
        fetch("/api/settings/brands"),
        fetch("/api/settings/content-types"),
      ]);

      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        setRoles(rolesData);
      }

      if (brandsRes.ok) {
        const brandsData = await brandsRes.json();
        setBrands(brandsData);
      }

      if (typesRes.ok) {
        const typesData = await typesRes.json();
        setContentTypes(typesData);
      }
    } catch (err) {
      console.error("Error loading team roles:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRolesAndTypes();
  }, []);

  // Helper: create a full default config for a specific Content Type
  const createDefaultConfigForType = (typeId: string, base?: Partial<ContentTypeRoleConfig>): ContentTypeRoleConfig => {
    const typeObj = contentTypes.find((ct) => ct.id === typeId || ct.name === typeId);

    const defaultScriptTask =
      typeObj?.workflow_tasks?.find((t) => t.task_name.toLowerCase().includes("script"))?.task_name ||
      typeObj?.workflow_tasks?.[0]?.task_name ||
      "Script";

    const defaultEditTask =
      typeObj?.workflow_tasks?.find((t) => t.task_name.toLowerCase().includes("edit"))?.task_name ||
      typeObj?.workflow_tasks?.[Math.min(3, (typeObj?.workflow_tasks?.length || 1) - 1)]?.task_name ||
      "Edit";

    const initTaskPerms: Record<string, AccessLevel> = {};
    (typeObj?.workflow_tasks || []).forEach((t) => {
      initTaskPerms[t.task_name.toLowerCase()] = "view";
    });

    const initFolderPerms: Record<string, AccessLevel> = {};
    const folders =
      typeObj?.default_folder_architecture && typeObj.default_folder_architecture.length > 0
        ? typeObj.default_folder_architecture
        : [{ id: "fld_raw", name: "Raw_Footage", parent_id: null }];
    folders.forEach((f) => {
      initFolderPerms[f.name] = "none";
    });

    const scriptingEnabled = Boolean(base?.responsibilities?.scripting?.enabled);
    const contentSubEnabled = Boolean(base?.responsibilities?.content_submission?.enabled);

    return {
      responsibilities: {
        scripting: {
          enabled: scriptingEnabled,
          target_task_name: base?.responsibilities?.scripting?.target_task_name || defaultScriptTask,
        },
        content_submission: {
          enabled: contentSubEnabled,
          target_task_name: base?.responsibilities?.content_submission?.target_task_name || defaultEditTask,
        },
      },
      index: {
        content_name: base?.index?.content_name || "view",
        task_target_date: base?.index?.task_target_date || "view",
        archive: base?.index?.archive || "view",
        tasks: { ...initTaskPerms, ...(base?.index?.tasks || {}) },
      },
      script_studio: {
        // Mandatory rule 1: If scripting enabled, access must be 'edit'
        access: scriptingEnabled ? "edit" : base?.script_studio?.access || "none",
      },
      content: {
        folders: { ...initFolderPerms, ...(base?.content?.folders || {}) },
        can_submit: contentSubEnabled ? true : Boolean(base?.content?.can_submit),
        submission: {
          // Mandatory rule 2: If content submission enabled, submit is mandatory
          disabled: contentSubEnabled ? false : (base?.content?.submission?.disabled ?? true),
          can_view_own: base?.content?.submission?.can_view_own ?? false,
          can_view_others: base?.content?.submission?.can_view_others ?? false,
          allowed_other_role_ids: base?.content?.submission?.allowed_other_role_ids || [],
          can_submit: contentSubEnabled ? true : (base?.content?.submission?.can_submit ?? false),
        },
      },
    };
  };

  // Currently active Content Type object being configured in the modal
  const activeContentType =
    contentTypes.find((ct) => ct.id === activeConfigTypeId) ||
    contentTypes.find((ct) => selectedTypeIds.includes(ct.id)) ||
    contentTypes[0] ||
    null;

  // Active configuration object for current activeContentType
  const currentConfig: ContentTypeRoleConfig =
    (activeContentType && configsByTypeId[activeContentType.id]) ||
    createDefaultConfigForType(activeContentType?.id || "default");

  // Helper to update current active config
  const updateCurrentConfig = (updater: (prev: ContentTypeRoleConfig) => ContentTypeRoleConfig) => {
    if (!activeContentType) return;
    setConfigsByTypeId((prev) => {
      const existing = prev[activeContentType.id] || createDefaultConfigForType(activeContentType.id);
      const updated = updater(existing);
      return {
        ...prev,
        [activeContentType.id]: updated,
      };
    });
  };

  // Available workflow tasks & folders for active Content Type
  const availableWorkflowTasks = activeContentType?.workflow_tasks || [];
  const availableFolders: FolderArchitectureItem[] =
    activeContentType?.default_folder_architecture &&
    Array.isArray(activeContentType.default_folder_architecture) &&
    activeContentType.default_folder_architecture.length > 0
      ? activeContentType.default_folder_architecture
      : [{ id: "fld_raw", name: "Raw_Footage", parent_id: null }];

  // Real-time debounced Google email verification
  const handleEmailChange = (val: string) => {
    setEmail(val);
    setEmailValidation(null);

    if (emailDebounceRef.current) {
      clearTimeout(emailDebounceRef.current);
    }

    const trimmed = val.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setEmailChecking(false);
      return;
    }

    setEmailChecking(true);
    emailDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/settings/roles/validate-email?email=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          setEmailValidation(data);
        } else {
          setEmailValidation({ valid: false, reason: "Verification service unavailable." });
        }
      } catch {
        setEmailValidation({ valid: false, reason: "Network error during email verification." });
      } finally {
        setEmailChecking(false);
      }
    }, 450);
  };

  const resetForm = () => {
    setName("");
    setEmail("");
    setRoleTitle("");
    setEmailValidation(null);
    setEmailChecking(false);
    setFormError(null);
    setEditingRoleId(null);

    const initialTypes = contentTypes.length > 0 ? [contentTypes[0].id] : [];
    setSelectedTypeIds(initialTypes);
    const initialActive = initialTypes[0] || "";
    setActiveConfigTypeId(initialActive);

    const initMap: Record<string, ContentTypeRoleConfig> = {};
    if (initialActive) {
      initMap[initialActive] = createDefaultConfigForType(initialActive);
    }
    setConfigsByTypeId(initMap);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (role: RoleItem) => {
    setName(role.name);
    setEmail(role.email);
    setRoleTitle(role.role_title);
    setEmailValidation({ valid: true });
    setEmailChecking(false);
    setEditingRoleId(role.id);
    setFormError(null);

    // Parse assigned content types
    let assigned = Array.isArray(role.assigned_content_types) ? role.assigned_content_types : [];
    if (assigned.length === 0 || assigned.includes("ALL")) {
      assigned = contentTypes.map((ct) => ct.id);
    }
    const resolvedTypeIds = assigned.length > 0 ? assigned : (contentTypes[0] ? [contentTypes[0].id] : []);
    setSelectedTypeIds(resolvedTypeIds);
    const firstActive = resolvedTypeIds[0] || "";
    setActiveConfigTypeId(firstActive);

    // Build configs map per content type
    const perms = role.permissions || {};
    const byType = perms.by_content_type || {};
    const map: Record<string, ContentTypeRoleConfig> = {};

    resolvedTypeIds.forEach((typeId) => {
      map[typeId] = createDefaultConfigForType(typeId, byType[typeId] || perms);
    });

    setConfigsByTypeId(map);
    setIsModalOpen(true);
  };

  // Group Content Series by parent Brand for Section 1 UI
  const seriesByBrand = React.useMemo(() => {
    const groups: {
      brand: BrandItem;
      series: ContentTypeSummary[];
    }[] = [];

    brands.forEach((b) => {
      const matching = contentTypes.filter((ct) => ct.brand_id === b.id);
      if (matching.length > 0) {
        groups.push({ brand: b, series: matching });
      }
    });

    const unassigned = contentTypes.filter(
      (ct) => !ct.brand_id || !brands.some((b) => b.id === ct.brand_id)
    );
    if (unassigned.length > 0) {
      groups.push({
        brand: { id: "_unassigned", name: "Other Series", color: "#6366f1", is_default: false },
        series: unassigned,
      });
    }

    return groups;
  }, [brands, contentTypes]);

  // Toggle Content Series assignment in Section 1
  const handleToggleContentType = (typeId: string) => {
    setSelectedTypeIds((prev) => {
      let next: string[];
      if (prev.includes(typeId)) {
        next = prev.filter((id) => id !== typeId);
      } else {
        next = [...prev, typeId];
      }

      // If active type was deselected, switch active tab to next available
      if (!next.includes(activeConfigTypeId)) {
        setActiveConfigTypeId(next[0] || "");
      }

      // Initialize default config if newly added
      if (!prev.includes(typeId) && !configsByTypeId[typeId]) {
        setConfigsByTypeId((c) => ({
          ...c,
          [typeId]: createDefaultConfigForType(typeId),
        }));
      }

      return next;
    });
  };

  // Toggle all Content Series within a single Brand
  const handleToggleBrandSeries = (brandSeriesIds: string[]) => {
    if (brandSeriesIds.length === 0) return;

    setSelectedTypeIds((prev) => {
      const allSelected = brandSeriesIds.every((id) => prev.includes(id));
      let next: string[];

      if (allSelected) {
        next = prev.filter((id) => !brandSeriesIds.includes(id));
      } else {
        const merged = new Set([...prev, ...brandSeriesIds]);
        next = Array.from(merged);

        // Ensure default configs exist for newly added series
        setConfigsByTypeId((c) => {
          const updated = { ...c };
          brandSeriesIds.forEach((id) => {
            if (!updated[id]) {
              updated[id] = createDefaultConfigForType(id);
            }
          });
          return updated;
        });
      }

      if (!next.includes(activeConfigTypeId)) {
        setActiveConfigTypeId(next[0] || "");
      }

      return next;
    });
  };

  // Handlers for Responsibility toggles (Mandatory rules enforced here)
  const handleToggleScripting = (enabled: boolean) => {
    updateCurrentConfig((prev) => {
      const resp = {
        ...prev.responsibilities,
        scripting: {
          enabled,
          target_task_name: prev.responsibilities?.scripting?.target_task_name || "Script",
        },
      };

      // Mandatory Rule 1: If responsibility is Scripting the edit feature of Script Studio is mandatory!
      const scriptStudio = {
        access: enabled ? ("edit" as AccessLevel) : prev.script_studio?.access || "none",
      };

      return {
        ...prev,
        responsibilities: resp,
        script_studio: scriptStudio,
      };
    });
  };

  const handleToggleContentSubmission = (enabled: boolean) => {
    updateCurrentConfig((prev) => {
      const resp = {
        ...prev.responsibilities,
        content_submission: {
          enabled,
          target_task_name: prev.responsibilities?.content_submission?.target_task_name || "Edit",
        },
      };

      // Mandatory Rule 2: If responsibility is Content Submission, the Submit permission in Deliverable is mandatory!
      const currentSub = prev.content?.submission || { disabled: true };
      const submission: SubmissionPermissions = enabled
        ? {
            ...currentSub,
            disabled: false,
            can_submit: true,
          }
        : currentSub;

      return {
        ...prev,
        responsibilities: resp,
        content: {
          ...prev.content,
          folders: prev.content?.folders || {},
          can_submit: enabled ? true : Boolean(prev.content?.can_submit),
          submission,
        },
      };
    });
  };

  // Handlers for Deliverable Submission Options
  const handleToggleSubmissionOption = (option: "disable" | "view_own" | "view_others" | "submit") => {
    updateCurrentConfig((prev) => {
      const currentSub = prev.content?.submission || { disabled: true };
      const isContentSubMandatory = Boolean(prev.responsibilities?.content_submission?.enabled);

      if (option === "disable") {
        if (isContentSubMandatory) return prev; // cannot disable while content submission is mandatory

        return {
          ...prev,
          content: {
            ...prev.content,
            folders: prev.content?.folders || {},
            can_submit: false,
            submission: {
              disabled: true,
              can_view_own: false,
              can_view_others: false,
              allowed_other_role_ids: [],
              can_submit: false,
            },
          },
        };
      }

      // Any of view_own, view_others, or submit
      let nextDisabled = false;
      let nextViewOwn = currentSub.can_view_own ?? false;
      let nextViewOthers = currentSub.can_view_others ?? false;
      let nextSubmit = isContentSubMandatory ? true : (currentSub.can_submit ?? false);
      let allowedOthers = currentSub.allowed_other_role_ids || [];

      if (option === "view_own") {
        nextViewOwn = !nextViewOwn;
      } else if (option === "view_others") {
        nextViewOthers = !nextViewOthers;
      } else if (option === "submit") {
        if (!isContentSubMandatory) {
          nextSubmit = !nextSubmit;
        }
      }

      // If all three are unchecked, revert to disabled
      if (!nextViewOwn && !nextViewOthers && !nextSubmit) {
        nextDisabled = true;
      }

      return {
        ...prev,
        content: {
          ...prev.content,
          folders: prev.content?.folders || {},
          can_submit: nextSubmit,
          submission: {
            disabled: nextDisabled,
            can_view_own: nextViewOwn,
            can_view_others: nextViewOthers,
            allowed_other_role_ids: allowedOthers,
            can_submit: nextSubmit,
          },
        },
      };
    });
  };

  // Toggle other team member ID for 'View Others'
  const handleToggleOtherMemberId = (roleId: string) => {
    updateCurrentConfig((prev) => {
      const currentSub = prev.content?.submission || {};
      const currentAllowed = currentSub.allowed_other_role_ids || [];
      const nextAllowed = currentAllowed.includes(roleId)
        ? currentAllowed.filter((id) => id !== roleId)
        : [...currentAllowed, roleId];

      return {
        ...prev,
        content: {
          ...prev.content,
          folders: prev.content?.folders || {},
          can_submit: currentSub.can_submit ?? false,
          submission: {
            ...currentSub,
            allowed_other_role_ids: nextAllowed,
          },
        },
      };
    });
  };

  // Select all or toggle other team members
  const handleToggleAllOtherMembers = (allRoleIds: string[]) => {
    updateCurrentConfig((prev) => {
      const currentSub = prev.content?.submission || {};
      const currentAllowed = currentSub.allowed_other_role_ids || [];
      const nextAllowed = currentAllowed.length === allRoleIds.length ? [] : allRoleIds;

      return {
        ...prev,
        content: {
          ...prev.content,
          folders: prev.content?.folders || {},
          can_submit: currentSub.can_submit ?? false,
          submission: {
            ...currentSub,
            allowed_other_role_ids: nextAllowed,
          },
        },
      };
    });
  };

  // Save role handler
  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Team member Name is required.");
      return;
    }
    if (!email.trim()) {
      setFormError("Google Email address is required.");
      return;
    }
    if (emailValidation && !emailValidation.valid) {
      setFormError(emailValidation.reason || "Please provide an authentic Google or Google Workspace email address.");
      return;
    }
    if (!roleTitle.trim()) {
      setFormError("Role Title is required.");
      return;
    }
    if (selectedTypeIds.length === 0) {
      setFormError("Please assign at least one Content Series to this team member.");
      return;
    }

    try {
      setSaving(true);

      // Ensure every selected content type has its config saved
      const finalConfigsByTypeId: Record<string, ContentTypeRoleConfig> = {};
      selectedTypeIds.forEach((typeId) => {
        finalConfigsByTypeId[typeId] = configsByTypeId[typeId] || createDefaultConfigForType(typeId);
      });

      // Primary fallback config for backwards compatibility
      const primaryConfig = finalConfigsByTypeId[selectedTypeIds[0]] || createDefaultConfigForType(selectedTypeIds[0]);

      const structuredPermissions: RolePermissions = {
        ...primaryConfig,
        by_content_type: finalConfigsByTypeId,
        // Legacy bindings for backwards compatibility
        can_submit: primaryConfig.content?.can_submit,
        can_edit: primaryConfig.index?.content_name === "edit",
        can_view: true,
        submission_task: primaryConfig.responsibilities?.content_submission?.enabled
          ? primaryConfig.responsibilities.content_submission.target_task_name
          : primaryConfig.responsibilities?.scripting?.enabled
          ? primaryConfig.responsibilities.scripting.target_task_name
          : undefined,
      };

      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role_title: roleTitle.trim(),
        assigned_content_types: selectedTypeIds,
        permissions: structuredPermissions,
      };

      const url = editingRoleId ? `/api/settings/roles/${editingRoleId}` : "/api/settings/roles";
      const method = editingRoleId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Failed to save team member role.");
        return;
      }

      setSuccessMsg(editingRoleId ? `Updated permissions for ${name}.` : `Added ${name} to Team & Roles.`);
      setTimeout(() => setSuccessMsg(null), 3000);

      setIsModalOpen(false);
      resetForm();
      await fetchRolesAndTypes();
    } catch (err) {
      console.error("Error saving team role:", err);
      setFormError("An unexpected error occurred while saving.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    if (!confirm(`Are you sure you want to remove ${roleName} from the team?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/settings/roles/${roleId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSuccessMsg(`Removed ${roleName}.`);
        setTimeout(() => setSuccessMsg(null), 3000);
        await fetchRolesAndTypes();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to delete role.");
      }
    } catch (err) {
      console.error("Error deleting role:", err);
    }
  };

  // Other team members available for 'View Others' selection
  const otherTeamMembers = roles.filter((r) => r.id !== editingRoleId);

  return (
    <div className="space-y-6">
      {/* Tab Header Banner */}
      <div className="card-theme p-5 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold">Team Members, Responsibilities & Permissions</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            Configure team members with authentic Google accounts, assign decoupled workflow capabilities
            (Scripting, Content Submission), connect target deadline tasks, and set individual permissions across
            multiple Brands &amp; Content Series.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="px-4 py-2 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 cursor-pointer shadow-xs transition-colors shrink-0"
          style={{ borderRadius: "var(--radius)" }}
        >
          <Plus className="w-4 h-4" />
          <span>Add Team Member</span>
        </button>
      </div>

      {/* Success Notification Alert */}
      {successMsg && (
        <div className="p-3.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Team Member Cards Grid */}
      {loading ? (
        <div className="card-theme p-12 text-center flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-xs font-mono">Loading team members...</span>
        </div>
      ) : roles.length === 0 ? (
        <div className="card-theme p-12 text-center space-y-3 border-dashed border-2 border-border/80">
          <Users className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          <h3 className="font-bold text-sm text-foreground">No Team Members Registered</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Add scriptwriters, video editors, and thumbnail artists with authentic Google accounts to grant
            granular workspace access and calculate dual timelines.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 cursor-pointer"
            style={{ borderRadius: "var(--radius)" }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add First Member</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles.map((role) => {
            const perms = role.permissions || {};
            const resp = perms.responsibilities || {};
            const assignedTypesList = Array.isArray(role.assigned_content_types) ? role.assigned_content_types : [];

            return (
              <div
                key={role.id}
                className="card-theme p-5 border border-border flex flex-col justify-between hover:border-primary/40 transition-all space-y-4"
                style={{ borderRadius: "var(--radius)" }}
              >
                {/* Card Top: Identity & Role */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{role.name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
                          {role.role_title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground/70" />
                        <span>{role.email}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(role)}
                        className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
                        title="Edit member permissions"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(role.id, role.name)}
                        className="p-1.5 hover:bg-destructive/15 text-muted-foreground hover:text-destructive rounded transition-colors cursor-pointer"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Assigned Content Series Badges */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">Assigned Series:</span>
                    {assignedTypesList.length === 0 || assignedTypesList.includes("ALL") ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-muted text-foreground border border-border">
                        All Content Series
                      </span>
                    ) : (
                      assignedTypesList.map((typeId) => {
                        const ctObj = contentTypes.find((c) => c.id === typeId || c.name === typeId);
                        const brandColor = ctObj?.brand?.color;
                        const brandLabel = brands.length > 1 && ctObj?.brand?.name ? `${ctObj.brand.name} · ` : "";
                        return (
                          <span
                            key={typeId}
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20 inline-flex items-center gap-1"
                          >
                            {brandColor && (
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: brandColor }}
                              />
                            )}
                            <span>{brandLabel}{ctObj?.name || typeId}</span>
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Bottom: Responsibilities & Permissions Summary */}
                <div className="space-y-3 pt-3 border-t border-border/80">
                  {/* Responsibilities */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block">
                      Active Responsibilities:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {resp.scripting?.enabled && (
                        <div className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-1.5">
                          <FileText className="w-3 h-3" />
                          <span>Scripting</span>
                          <span className="text-[10px] font-mono text-amber-300/80">
                            (Target: {resp.scripting.target_task_name || "Script"})
                          </span>
                        </div>
                      )}

                      {resp.content_submission?.enabled && (
                        <div className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-1.5">
                          <Video className="w-3 h-3" />
                          <span>Content Submission</span>
                          <span className="text-[10px] font-mono text-emerald-300/80">
                            (Target: {resp.content_submission.target_task_name || "Edit"})
                          </span>
                        </div>
                      )}

                      {!resp.scripting?.enabled && !resp.content_submission?.enabled && (
                        <span className="text-xs text-muted-foreground font-mono italic">
                          No specific responsibility assigned (Permissions only)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Permissions Summary Badges */}
                  <div className="pt-2 border-t border-border/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[10px] font-mono">
                    <div className="p-2 rounded-xl glass-subtle">
                      <span className="text-muted-foreground block">Title Access</span>
                      <span className="font-bold text-foreground capitalize">
                        {perms.index?.content_name || "view"}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl glass-subtle">
                      <span className="text-muted-foreground block">Archive Access</span>
                      <span className="font-bold text-foreground capitalize">
                        {perms.index?.archive || "view"}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl glass-subtle">
                      <span className="text-muted-foreground block">Script Studio</span>
                      <span className="font-bold text-foreground capitalize">
                        {perms.script_studio?.access || "none"}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl glass-subtle">
                      <span className="text-muted-foreground block">Submission</span>
                      <span
                        className={`font-bold ${
                          perms.content?.submission?.disabled
                            ? "text-muted-foreground"
                            : perms.content?.submission?.can_submit || perms.content?.can_submit
                            ? "text-emerald-400"
                            : "text-blue-400"
                        }`}
                      >
                        {perms.content?.submission?.disabled
                          ? "Disabled"
                          : perms.content?.submission?.can_submit || perms.content?.can_submit
                          ? "Submit"
                          : "View Only"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Add / Edit Team Member Modal                                   */}
      {/* ------------------------------------------------------------- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="glass-modal w-full max-w-3xl my-8 p-6 rounded-2xl space-y-6 max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Title */}
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-bold text-base text-foreground">
                    {editingRoleId ? "Edit Team Member & Permissions" : "Add New Team Member"}
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono">
                    Configure Google identity, multi-series pipelines, responsibilities &amp; granular permissions
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-md bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveRole} className="space-y-6">
              {/* SECTION 1: Member Identity & Multi-Content-Type Assignment */}
              <div className="space-y-4 p-4 rounded-lg bg-muted/20 border border-border/80">
                <div className="flex items-center gap-2 pb-2 border-b border-border/60 text-xs font-mono font-bold text-foreground uppercase tracking-wider">
                  <UserCheck className="w-4 h-4 text-primary" />
                  <span>1. Member Profile &amp; Content Series Pipelines</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex Rivera"
                      className="w-full h-9 px-3 text-xs rounded bg-background border border-border focus:outline-none focus:border-primary font-mono"
                    />
                  </div>

                  {/* Role Title */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Role Title</label>
                    <input
                      type="text"
                      required
                      value={roleTitle}
                      onChange={(e) => setRoleTitle(e.target.value)}
                      placeholder="e.g. Senior Scriptwriter, Video Editor"
                      className="w-full h-9 px-3 text-xs rounded bg-background border border-border focus:outline-none focus:border-primary font-mono"
                    />
                  </div>
                </div>

                {/* Google Email Address */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Google Email ID</label>
                    {emailChecking && (
                      <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" /> Verifying...
                      </span>
                    )}
                    {!emailChecking && emailValidation && (
                      <span
                        className={`text-[10px] font-mono flex items-center gap-1 font-bold ${
                          emailValidation.valid ? "text-emerald-400" : "text-destructive"
                        }`}
                      >
                        {emailValidation.valid ? "✓ Authentic Google Email" : "⚠ Non-Google Domain"}
                      </span>
                    )}
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    placeholder="alex@gmail.com or alex@workspace-domain.com"
                    className="w-full h-9 px-3 text-xs rounded bg-background border border-border focus:outline-none focus:border-primary font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Must be an authentic Google Account (@gmail.com, @googlemail.com, or Google Workspace MX domain).
                  </p>
                </div>

                {/* Multi-Brand Content Series Selection */}
                <div className="space-y-3 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">
                      Assign to Content Series (Grouped by Brand):
                    </label>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {selectedTypeIds.length} series assigned
                    </span>
                  </div>

                  <div className="space-y-3">
                    {seriesByBrand.map(({ brand, series }) => {
                      const brandSeriesIds = series.map((s) => s.id);
                      const allSelectedInBrand =
                        brandSeriesIds.length > 0 &&
                        brandSeriesIds.every((id) => selectedTypeIds.includes(id));

                      return (
                        <div
                          key={brand.id}
                          className="p-3 rounded-xl glass-subtle border border-border/70 space-y-2.5"
                        >
                          {/* Brand Header + Select All / Deselect All Toggle */}
                          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/50">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: brand.color || "#6366f1" }}
                              />
                              <span className="text-xs font-bold text-foreground">
                                {brand.name}
                              </span>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                ({series.length} series)
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleBrandSeries(brandSeriesIds)}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold bg-background/80 hover:bg-muted text-primary border border-border transition-colors cursor-pointer"
                            >
                              {allSelectedInBrand ? "Deselect All" : "Select All in Brand"}
                            </button>
                          </div>

                          {/* Content Series Checkboxes under this Brand */}
                          <div className="flex flex-wrap gap-2">
                            {series.map((ct) => {
                              const isSelected = selectedTypeIds.includes(ct.id);
                              return (
                                <label
                                  key={ct.id}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-2 cursor-pointer border select-none ${
                                    isSelected
                                      ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                                      : "bg-background/70 text-muted-foreground hover:text-foreground border-border hover:bg-muted"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleToggleContentType(ct.id)}
                                    className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                                  />
                                  <Layers className="w-3 h-3 opacity-80" />
                                  <span>{ct.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* PIPELINE SWITCHER: If multiple series selected, switch between them to configure individual settings */}
              {selectedTypeIds.length > 0 && (
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg bg-card border border-primary/30 shadow-xs">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    <span className="text-xs font-mono font-bold text-foreground uppercase tracking-wider shrink-0">
                      Configure Settings For:
                    </span>
                    {selectedTypeIds.map((typeId) => {
                      const ctObj = contentTypes.find((ct) => ct.id === typeId || ct.name === typeId);
                      const isActive = activeConfigTypeId === typeId;
                      const brandColor = ctObj?.brand?.color;
                      const brandPrefix =
                        brands.length > 1 && ctObj?.brand?.name ? `${ctObj.brand.name} · ` : "";
                      return (
                        <button
                          key={typeId}
                          type="button"
                          onClick={() => setActiveConfigTypeId(typeId)}
                          className={`px-3 py-1 rounded text-xs font-mono font-semibold transition-all cursor-pointer border shrink-0 inline-flex items-center gap-1.5 ${
                            isActive
                              ? "bg-primary text-primary-foreground border-primary shadow-xs"
                              : "bg-muted/50 text-muted-foreground hover:text-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {brandColor && (
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: brandColor }}
                            />
                          )}
                          <span>{brandPrefix}{ctObj?.name || typeId}</span>
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
                    Settings 1 to 3 are individual per series
                  </span>
                </div>
              )}

              {/* SECTION 2: Decoupled Responsibilities & Target Dates for Active Content Type */}
              <div className="space-y-4 p-4 rounded-lg bg-muted/20 border border-border/80">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-foreground uppercase tracking-wider">
                    <Clock className="w-4 h-4 text-primary" />
                    <span>2. Responsibilities & Target Deadlines ({activeContentType?.name})</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    1st Buffer → Final Buffer on revision
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Responsibility 1: Scripting */}
                  <div
                    className={`p-3.5 rounded-lg border transition-all ${
                      currentConfig.responsibilities?.scripting?.enabled
                        ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-muted/30 border-border/60 opacity-80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          id={`resp_scripting_${activeConfigTypeId}`}
                          checked={Boolean(currentConfig.responsibilities?.scripting?.enabled)}
                          onChange={(e) => handleToggleScripting(e.target.checked)}
                          className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                        />
                        <label
                          htmlFor={`resp_scripting_${activeConfigTypeId}`}
                          className="font-semibold text-xs text-foreground cursor-pointer"
                        >
                          Scripting Responsibility
                        </label>
                      </div>

                      {currentConfig.responsibilities?.scripting?.enabled && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                          Script Studio Access: Mandatory Edit
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-6.5 leading-relaxed">
                      Grants capability to write, edit scripts in Script Studio, and submit scripts for Creator review.
                      (Mandatorily locks Script Studio access to Edit).
                    </p>

                    {currentConfig.responsibilities?.scripting?.enabled && (
                      <div className="mt-3 ml-6.5 pt-3 border-t border-amber-500/20 flex flex-col sm:flex-row sm:items-center gap-3">
                        <label className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                          Fetch Target Date from Task:
                        </label>
                        <select
                          value={currentConfig.responsibilities?.scripting?.target_task_name || "Script"}
                          onChange={(e) =>
                            updateCurrentConfig((prev) => ({
                              ...prev,
                              responsibilities: {
                                ...prev.responsibilities,
                                scripting: {
                                  enabled: true,
                                  target_task_name: e.target.value,
                                },
                              },
                            }))
                          }
                          className="h-8 px-2.5 text-xs rounded bg-background border border-amber-500/40 text-foreground font-mono focus:outline-none"
                        >
                          {availableWorkflowTasks.map((t) => (
                            <option key={t.id} value={t.task_name}>
                              {t.task_name} (Sequence {t.sequence_order})
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          (1st Buffer → Final Buffer on revision)
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Responsibility 2: Content Submission */}
                  <div
                    className={`p-3.5 rounded-lg border transition-all ${
                      currentConfig.responsibilities?.content_submission?.enabled
                        ? "bg-emerald-500/10 border-emerald-500/30"
                        : "bg-muted/30 border-border/60 opacity-80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          id={`resp_content_sub_${activeConfigTypeId}`}
                          checked={Boolean(currentConfig.responsibilities?.content_submission?.enabled)}
                          onChange={(e) => handleToggleContentSubmission(e.target.checked)}
                          className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                        />
                        <label
                          htmlFor={`resp_content_sub_${activeConfigTypeId}`}
                          className="font-semibold text-xs text-foreground cursor-pointer"
                        >
                          Content Submission Responsibility
                        </label>
                      </div>

                      {currentConfig.responsibilities?.content_submission?.enabled && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                          Deliverable Submit: Mandatory
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-6.5 leading-relaxed">
                      Allows member to access Content Hub and upload deliverable submissions for review.
                      (Mandatorily unlocks and checks the Submit permission in Deliverable Submission).
                    </p>

                    {currentConfig.responsibilities?.content_submission?.enabled && (
                      <div className="mt-3 ml-6.5 pt-3 border-t border-emerald-500/20 flex flex-col sm:flex-row sm:items-center gap-3">
                        <label className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                          Fetch Target Date from Task:
                        </label>
                        <select
                          value={currentConfig.responsibilities?.content_submission?.target_task_name || "Edit"}
                          onChange={(e) =>
                            updateCurrentConfig((prev) => ({
                              ...prev,
                              responsibilities: {
                                ...prev.responsibilities,
                                content_submission: {
                                  enabled: true,
                                  target_task_name: e.target.value,
                                },
                              },
                            }))
                          }
                          className="h-8 px-2.5 text-xs rounded bg-background border border-emerald-500/40 text-foreground font-mono focus:outline-none"
                        >
                          {availableWorkflowTasks.map((t) => (
                            <option key={t.id} value={t.task_name}>
                              {t.task_name} (Sequence {t.sequence_order})
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          (1st Buffer → Final Buffer on revision)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 3: Workspace Permissions Matrix for Active Content Type */}
              <div className="space-y-4 p-4 rounded-lg bg-muted/20 border border-border/80">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-foreground uppercase tracking-wider">
                    <Key className="w-4 h-4 text-primary" />
                    <span>3. Workspace Permissions ({activeContentType?.name})</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">
                    Pipeline: {activeContentType?.name}
                  </span>
                </div>

                {/* Sub-bucket A: Index Permissions */}
                <div className="space-y-3 pb-4 border-b border-border/60">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-2">
                    <ListTodo className="w-3.5 h-3.5 text-primary" />
                    <span>A. Tracker Index Permissions</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Content Name Access */}
                    <div className="p-3 rounded bg-muted/30 border border-border/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Content Title Access</span>
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">
                          {currentConfig.index?.content_name || "view"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 bg-background p-1 rounded border border-border">
                        {(["none", "view", "edit"] as AccessLevel[]).map((level) => {
                          const isSel = (currentConfig.index?.content_name || "view") === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() =>
                                updateCurrentConfig((prev) => ({
                                  ...prev,
                                  index: {
                                    ...(prev.index || { tasks: {}, task_target_date: "view" }),
                                    content_name: level,
                                  },
                                }))
                              }
                              className={`py-1 text-[11px] font-mono rounded capitalize transition-all cursor-pointer ${
                                isSel
                                  ? level === "edit"
                                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                                    : level === "view"
                                    ? "bg-muted text-foreground font-bold"
                                    : "bg-destructive/20 text-destructive font-bold"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Task Target Date (Worst-Case Deadline) Access */}
                    <div className="p-3 rounded bg-muted/30 border border-border/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Worst-Case Target Date</span>
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">
                          {currentConfig.index?.task_target_date || "view"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 bg-background p-1 rounded border border-border">
                        {(["none", "view"] as TargetDateAccessLevel[]).map((level) => {
                          const isSel = (currentConfig.index?.task_target_date || "view") === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() =>
                                updateCurrentConfig((prev) => ({
                                  ...prev,
                                  index: {
                                    ...(prev.index || { content_name: "view", tasks: {} }),
                                    task_target_date: level,
                                  },
                                }))
                              }
                              className={`py-1 text-[11px] font-mono rounded capitalize transition-all cursor-pointer ${
                                isSel
                                  ? level === "view"
                                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                                    : "bg-destructive/20 text-destructive font-bold"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Archive Access (None / View / Edit) */}
                    <div className="p-3 rounded bg-muted/30 border border-border/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Archive Access</span>
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">
                          {currentConfig.index?.archive || "view"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 bg-background p-1 rounded border border-border">
                        {(["none", "view", "edit"] as AccessLevel[]).map((level) => {
                          const isSel = (currentConfig.index?.archive || "view") === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() =>
                                updateCurrentConfig((prev) => ({
                                  ...prev,
                                  index: {
                                    ...(prev.index || { content_name: "view", tasks: {}, task_target_date: "view" }),
                                    archive: level,
                                  },
                                }))
                              }
                              className={`py-1 text-[11px] font-mono rounded capitalize transition-all cursor-pointer ${
                                isSel
                                  ? level === "edit"
                                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                                    : level === "view"
                                    ? "bg-muted text-foreground font-bold"
                                    : "bg-destructive/20 text-destructive font-bold"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Individual Task Permissions Table */}
                  <div className="space-y-1.5 pt-2">
                    <span className="text-xs font-semibold text-foreground block">Individual Task Permissions:</span>
                    <p className="text-[11px] text-muted-foreground">
                      Define custom View or Edit permissions for each workflow task in {activeContentType?.name}. (Task permissions apply commonly to both Active Index and Archive Vault).
                    </p>

                    <div className="border border-border/80 rounded overflow-hidden">
                      <table className="w-full text-xs font-mono">
                        <thead className="bg-muted/60 text-muted-foreground border-b border-border/80 text-[10px]">
                          <tr>
                            <th className="py-1.5 px-3 text-left font-bold">Workflow Task</th>
                            <th className="py-1.5 px-3 text-left">Sequence</th>
                            <th className="py-1.5 px-3 text-right">Access Permission</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {availableWorkflowTasks.map((t) => {
                            const taskKey = t.task_name.toLowerCase();
                            const currentVal = currentConfig.index?.tasks?.[taskKey] || "none";

                            return (
                              <tr key={t.id} className="hover:bg-muted/20">
                                <td className="py-1.5 px-3 font-semibold text-foreground">{t.task_name}</td>
                                <td className="py-1.5 px-3 text-muted-foreground">Step {t.sequence_order}</td>
                                <td className="py-1.5 px-3 text-right">
                                  <div className="inline-flex items-center gap-1 bg-background p-0.5 rounded border border-border">
                                    {(["none", "view", "edit"] as AccessLevel[]).map((level) => (
                                      <button
                                        key={level}
                                        type="button"
                                        onClick={() =>
                                          updateCurrentConfig((prev) => ({
                                            ...prev,
                                            index: {
                                              ...(prev.index || {
                                                content_name: "view",
                                                task_target_date: "view",
                                                tasks: {},
                                              }),
                                              tasks: {
                                                ...(prev.index?.tasks || {}),
                                                [taskKey]: level,
                                              },
                                            },
                                          }))
                                        }
                                        className={`px-2 py-0.5 text-[10px] rounded capitalize transition-all cursor-pointer ${
                                          currentVal === level
                                            ? level === "edit"
                                              ? "bg-primary text-primary-foreground font-bold shadow-xs"
                                              : level === "view"
                                              ? "bg-muted text-foreground font-bold"
                                              : "bg-destructive/20 text-destructive font-bold"
                                            : "text-muted-foreground hover:text-foreground"
                                        }`}
                                      >
                                        {level}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Sub-bucket B: Script Studio Permissions */}
                <div className="space-y-3 pb-4 border-b border-border/60">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-foreground flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                      <span>B. Script Studio Workspace Access</span>
                    </h4>
                    {currentConfig.responsibilities?.scripting?.enabled && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Edit Mandatory (Scripting Assigned)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Controls whether this member can access Script Studio. Edit access allows writing lines, canvas, notes,
                    and submitting scripts for Creator review.
                  </p>

                  <div className="grid grid-cols-3 gap-1 bg-background p-1 rounded border border-border max-w-md">
                    {(["none", "view", "edit"] as AccessLevel[]).map((level) => {
                      const isSel = (currentConfig.script_studio?.access || "none") === level;
                      const isMandatoryLocked = currentConfig.responsibilities?.scripting?.enabled && level !== "edit";

                      return (
                        <button
                          key={level}
                          type="button"
                          disabled={isMandatoryLocked}
                          onClick={() =>
                            updateCurrentConfig((prev) => ({
                              ...prev,
                              script_studio: { access: level },
                            }))
                          }
                          className={`py-1 text-[11px] font-mono rounded capitalize transition-all ${
                            isSel
                              ? level === "edit"
                                ? "bg-primary text-primary-foreground font-bold shadow-xs"
                                : level === "view"
                                ? "bg-muted text-foreground font-bold"
                                : "bg-destructive/20 text-destructive font-bold"
                              : "text-muted-foreground hover:text-foreground"
                          } ${isMandatoryLocked ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          {level}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sub-bucket C: Content Hub & Deliverable Submission */}
                <div className="space-y-4">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-2">
                    <Video className="w-3.5 h-3.5 text-primary" />
                    <span>C. Content Hub, Google Drive & Deliverable Submissions</span>
                  </h4>

                  {/* Deliverable Submission Permissions (New 4-state system) */}
                  <div className="p-3.5 rounded-lg bg-background border border-border space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-border/60">
                      <div>
                        <span className="text-xs font-bold text-foreground block">
                          Deliverable Submission Options
                        </span>
                        <p className="text-[11px] text-muted-foreground">
                          Either select <strong>Disable</strong> (hides submission section completely); OR choose one or
                          multiple from <strong>View Own</strong>, <strong>View Others</strong>, and <strong>Submit</strong>.
                        </p>
                      </div>

                      {currentConfig.responsibilities?.content_submission?.enabled && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1 shrink-0">
                          <Lock className="w-2.5 h-2.5" /> Submit Mandatory (Content Sub Assigned)
                        </span>
                      )}
                    </div>

                    {/* 4 Pillars: Disable | View Own | View Others | Submit */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {/* Option 1: Disable */}
                      <button
                        type="button"
                        disabled={currentConfig.responsibilities?.content_submission?.enabled}
                        onClick={() => handleToggleSubmissionOption("disable")}
                        className={`p-2.5 rounded border text-left transition-all ${
                          currentConfig.content?.submission?.disabled
                            ? "bg-destructive/15 text-destructive border-destructive/40 font-bold shadow-xs"
                            : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
                        } ${
                          currentConfig.responsibilities?.content_submission?.enabled
                            ? "opacity-30 cursor-not-allowed"
                            : "cursor-pointer"
                        }`}
                      >
                        <div className="text-xs font-semibold">Disable</div>
                        <div className="text-[9px] opacity-75 mt-0.5">Hide submission section</div>
                      </button>

                      {/* Option 2: View Own */}
                      <button
                        type="button"
                        onClick={() => handleToggleSubmissionOption("view_own")}
                        className={`p-2.5 rounded border text-left transition-all cursor-pointer ${
                          currentConfig.content?.submission?.can_view_own
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 font-bold shadow-xs"
                            : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
                        }`}
                      >
                        <div className="text-xs font-semibold">View Own</div>
                        <div className="text-[9px] opacity-75 mt-0.5">Can see own uploads</div>
                      </button>

                      {/* Option 3: View Others */}
                      <button
                        type="button"
                        onClick={() => handleToggleSubmissionOption("view_others")}
                        className={`p-2.5 rounded border text-left transition-all cursor-pointer ${
                          currentConfig.content?.submission?.can_view_others
                            ? "bg-purple-500/15 text-purple-300 border-purple-500/40 font-bold shadow-xs"
                            : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
                        }`}
                      >
                        <div className="text-xs font-semibold">View Others</div>
                        <div className="text-[9px] opacity-75 mt-0.5">Peer submissions view</div>
                      </button>

                      {/* Option 4: Submit */}
                      <button
                        type="button"
                        disabled={currentConfig.responsibilities?.content_submission?.enabled}
                        onClick={() => handleToggleSubmissionOption("submit")}
                        className={`p-2.5 rounded border text-left transition-all ${
                          currentConfig.content?.submission?.can_submit
                            ? "bg-blue-500/15 text-blue-400 border-blue-500/40 font-bold shadow-xs"
                            : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
                        } ${
                          currentConfig.responsibilities?.content_submission?.enabled
                            ? "cursor-default"
                            : "cursor-pointer"
                        }`}
                      >
                        <div className="text-xs font-semibold flex items-center justify-between">
                          <span>Submit</span>
                          {currentConfig.responsibilities?.content_submission?.enabled && (
                            <span className="text-[8px] uppercase font-mono text-emerald-400">Locked</span>
                          )}
                        </div>
                        <div className="text-[9px] opacity-75 mt-0.5">Upload new iterations</div>
                      </button>
                    </div>

                    {/* View Others Member Selection Checklist */}
                    {currentConfig.content?.submission?.can_view_others && (
                      <div className="mt-3 p-3 rounded-md bg-muted/40 border border-border space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground font-mono">
                            Select members whose submissions are visible to this user:
                          </span>
                          {otherTeamMembers.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleToggleAllOtherMembers(otherTeamMembers.map((m) => m.id))}
                              className="text-[10px] font-mono text-primary hover:underline cursor-pointer"
                            >
                              Toggle All
                            </button>
                          )}
                        </div>

                        {otherTeamMembers.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground italic font-mono">
                            No other team members currently registered.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {otherTeamMembers.map((member) => {
                              const isChecked = Boolean(
                                currentConfig.content?.submission?.allowed_other_role_ids?.includes(member.id)
                              );

                              return (
                                <label
                                  key={member.id}
                                  className={`flex items-center gap-2 p-2 rounded border text-xs cursor-pointer transition-colors ${
                                    isChecked
                                      ? "bg-primary/10 border-primary/40 text-foreground font-semibold"
                                      : "bg-background border-border text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleOtherMemberId(member.id)}
                                    className="w-3.5 h-3.5 rounded text-primary focus:ring-primary cursor-pointer"
                                  />
                                  <div className="flex flex-col min-w-0">
                                    <span className="truncate">{member.name}</span>
                                    <span className="text-[10px] text-muted-foreground font-mono truncate">
                                      {member.role_title} ({member.email})
                                    </span>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Individual Folder-Wise Matrix */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <FolderTree className="w-3.5 h-3.5 text-amber-500" />
                      <span>Individual Folder-Wise Access Matrix ({activeContentType?.name}):</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Edit access allows uploading new footage files, creating subfolders, and removing files from that folder.
                    </p>

                    <div className="border border-border/80 rounded overflow-hidden">
                      <table className="w-full text-xs font-mono">
                        <thead className="bg-muted/60 text-muted-foreground border-b border-border/80 text-[10px]">
                          <tr>
                            <th className="py-1.5 px-3 text-left font-bold">Google Drive Folder</th>
                            <th className="py-1.5 px-3 text-right">Access Permission</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {availableFolders.map((f) => {
                            const currentVal = currentConfig.content?.folders?.[f.name] || "none";

                            return (
                              <tr key={f.id} className="hover:bg-muted/20">
                                <td className="py-1.5 px-3 font-semibold text-foreground flex items-center gap-2">
                                  <FolderTree className="w-3 h-3 text-amber-500" />
                                  <span>{f.name}</span>
                                </td>
                                <td className="py-1.5 px-3 text-right">
                                  <div className="inline-flex items-center gap-1 bg-background p-0.5 rounded border border-border">
                                    {(["none", "view", "edit"] as AccessLevel[]).map((level) => (
                                      <button
                                        key={level}
                                        type="button"
                                        onClick={() =>
                                          updateCurrentConfig((prev) => ({
                                            ...prev,
                                            content: {
                                              ...prev.content,
                                              can_submit: prev.content?.can_submit ?? false,
                                              folders: {
                                                ...(prev.content?.folders || {}),
                                                [f.name]: level,
                                              },
                                            },
                                          }))
                                        }
                                        className={`px-2 py-0.5 text-[10px] rounded capitalize transition-all cursor-pointer ${
                                          currentVal === level
                                            ? level === "edit"
                                              ? "bg-primary text-primary-foreground font-bold shadow-xs"
                                              : level === "view"
                                              ? "bg-muted text-foreground font-bold"
                                              : "bg-destructive/20 text-destructive font-bold"
                                            : "text-muted-foreground hover:text-foreground"
                                        }`}
                                      >
                                        {level}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                  style={{ borderRadius: "var(--radius)" }}
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{editingRoleId ? "Update Team Member" : "Save Team Member"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}