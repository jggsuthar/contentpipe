/**
 * Atomic Permission System for ContentPipe
 * Exhaustive micro-action permission strings with implicit inheritance from submission tasks.
 */
import prisma from "@/lib/prisma";
import { isCreatorEmail } from "@/lib/constants/users";
import { ContentTypeRoleConfig, RolePermissions } from "@/types/database";

/**
 * Resolves role configuration (responsibilities, index, script studio, content)
 * specifically for a content type, falling back to top-level permissions if not customized.
 */
export function getRoleConfigForContentType(
  permissions?: RolePermissions | null,
  contentTypeId?: string | null
): ContentTypeRoleConfig {
  if (!permissions) {
    return {};
  }

  if (contentTypeId && permissions.by_content_type?.[contentTypeId]) {
    return permissions.by_content_type[contentTypeId];
  }

  return {
    responsibilities: permissions.responsibilities,
    index: permissions.index,
    script_studio: permissions.script_studio,
    content: permissions.content,
  };
}

// ─────────────────────────────────────────────────────────────
// A. Atomic Permission String Union Type
// ─────────────────────────────────────────────────────────────
export type AtomicPermission =
  // Administrative & Settings
  | "admin:super"
  | "settings:manage_content_types"
  | "settings:manage_workflows"
  | "settings:manage_roles"
  // Tracker & Matrix Board
  | "tracker:view"
  | "tracker:horizon:generate"
  | "tracker:row:edit_title"
  | "tracker:row:move_slot"
  | "tracker:row:edit_publish_date"
  | "tracker:row:archive"
  | "tracker:task:status_own"
  | "tracker:task:status_any"
  | "tracker:action_item:create"
  | "tracker:action_item:resolve"
  | "tracker:misc_task:manage"
  | "tracker:misc_task:resolve"
  // Idea Bank
  | "idea:view"
  | "idea:create"
  | "idea:edit"
  | "idea:delete"
  | "idea:assign"
  // Scripting Studio
  | "script:view"
  | "script:row:create"
  | "script:row:edit"
  | "script:row:delete"
  | "script:schema:manage"
  | "script:canvas:edit"
  | "script:notes:edit"
  | "script:comment:create"
  | "script:comment:resolve"
  // Drive & Content Hub
  | "drive:raw:view"
  | "drive:raw:upload"
  | "drive:raw:delete"
  | "drive:broll:view"
  | "drive:broll:upload"
  | "drive:broll:delete"
  | "storage:cleanup_trigger"
  // Review
  | "review:submission:upload"
  | "review:submission:view"
  | "review:submission:delete_own"
  | "review:comment:create"
  | "review:comment:resolve"
  | "review:decision:reject"
  | "review:decision:approve";

// ─────────────────────────────────────────────────────────────
// B. Implicit Permission Inheritance Map
// Primary submission task → strict minimal atomic permissions
// Per SPEC Prompt 10 Section 2
// ─────────────────────────────────────────────────────────────
export const TASK_IMPLICIT_PERMISSIONS: Record<string, AtomicPermission[]> = {
  script: [
    "tracker:view",
    "tracker:task:status_own",
    "script:view",
    "script:row:create",
    "script:row:edit",
    "script:row:delete",
    "script:canvas:edit",
    "script:notes:edit",
  ],
  shoot: [
    "tracker:view",
    "tracker:task:status_own",
    "script:view",
    "drive:raw:upload",
    "drive:broll:upload",
  ],
  edit: [
    "tracker:view",
    "tracker:task:status_own",
    "script:view",
    "drive:raw:view",
    "drive:broll:view",
    "review:submission:upload",
    "review:submission:view",
    "review:comment:resolve",
  ],
  ideation: [
    "tracker:view",
    "tracker:task:status_own",
    "tracker:row:edit_title",
    "idea:view",
    "idea:create",
    "idea:edit",
  ],
  schedule: [
    "tracker:view",
    "tracker:task:status_own",
  ],
  publish: [
    "tracker:view",
    "tracker:task:status_own",
    "tracker:row:edit_publish_date",
    "tracker:row:archive",
  ],
};

/**
 * Normalizes task name to lowercase for implicit permission lookup
 */
export function getImplicitPermissionsForTask(taskName?: string | null): AtomicPermission[] {
  if (!taskName) return [];
  const key = taskName.trim().toLowerCase();
  return TASK_IMPLICIT_PERMISSIONS[key] || [];
}

// ─────────────────────────────────────────────────────────────
// C. Permission Categories (for UI accordion rendering)
// ─────────────────────────────────────────────────────────────
export interface PermissionCategory {
  id: string;
  label: string;
  permissions: {
    key: AtomicPermission;
    label: string;
    description: string;
  }[];
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: "admin",
    label: "Administrative & Settings",
    permissions: [
      { key: "admin:super", label: "Super Admin", description: "Absolute override — bypasses all other checks (Creator only)" },
      { key: "settings:manage_content_types", label: "Manage Content Types", description: "Create, edit, and delete content types and cadence rules" },
      { key: "settings:manage_workflows", label: "Manage Workflows", description: "Edit P-n offsets, add or remove workflow stages" },
      { key: "settings:manage_roles", label: "Manage Roles", description: "Add team members, assign permissions" },
    ],
  },
  {
    id: "tracker",
    label: "Tracker & Matrix Board",
    permissions: [
      { key: "tracker:view", label: "View Tracker", description: "Read-only access to the matrix board" },
      { key: "tracker:horizon:generate", label: "Generate Horizon", description: "Generate new placeholder rows based on cadence" },
      { key: "tracker:row:edit_title", label: "Edit Row Title", description: "Enter or change video titles (triggers ID generation)" },
      { key: "tracker:row:move_slot", label: "Move Slot", description: "Drag or reassign a row to a different publish slot" },
      { key: "tracker:row:edit_publish_date", label: "Edit Publish Date", description: "Directly change the publish date on a row" },
      { key: "tracker:row:archive", label: "Archive Row", description: "Move a completed row to the Archive Vault" },
      { key: "tracker:task:status_own", label: "Update Own Task Status", description: "Check off tasks in their own submission responsibility" },
      { key: "tracker:task:status_any", label: "Update Any Task Status", description: "Override status of any task on any row" },
      { key: "tracker:action_item:create", label: "Create Action Items", description: "Add custom action items to any content row" },
      { key: "tracker:action_item:resolve", label: "Resolve Action Items", description: "Mark action items as done" },
      { key: "tracker:misc_task:manage", label: "Manage Misc Tasks", description: "Add or remove misc task entries" },
      { key: "tracker:misc_task:resolve", label: "Resolve Misc Tasks", description: "Check off misc tasks" },
    ],
  },
  {
    id: "idea",
    label: "Idea Bank",
    permissions: [
      { key: "idea:view", label: "View Ideas", description: "Read-only access to the Idea Bank drawer" },
      { key: "idea:create", label: "Create Ideas", description: "Add new ideas to the bank" },
      { key: "idea:edit", label: "Edit Ideas", description: "Modify existing idea titles and notes" },
      { key: "idea:delete", label: "Delete Ideas", description: "Remove ideas from the bank" },
      { key: "idea:assign", label: "Assign Ideas", description: "Link an idea to a tracker content slot" },
    ],
  },
  {
    id: "script",
    label: "Scripting Studio",
    permissions: [
      { key: "script:view", label: "View Scripts", description: "Read-only access to the table, notes, and Teleprompter mode" },
      { key: "script:row:create", label: "Create Script Rows", description: "Add new dialogue/shot rows" },
      { key: "script:row:edit", label: "Edit Script Rows", description: "Edit text/dropdowns inside existing rows" },
      { key: "script:row:delete", label: "Delete Script Rows", description: "Delete rows" },
      { key: "script:schema:manage", label: "Manage Script Schema", description: "Add, hide, or delete custom columns for a specific script" },
      { key: "script:canvas:edit", label: "Edit Canvas", description: "Draw or erase on the digital storyboard canvas" },
      { key: "script:notes:edit", label: "Edit Notes", description: "Edit the rich-text global notes below the table" },
      { key: "script:comment:create", label: "Create Comments", description: "Leave inline feedback on a script row" },
      { key: "script:comment:resolve", label: "Resolve Comments", description: "Mark script feedback as resolved" },
    ],
  },
  {
    id: "drive",
    label: "Content Hub & Google Drive",
    permissions: [
      { key: "drive:raw:view", label: "View Raw Footage", description: "Stream/download from 01_Raw_Footage" },
      { key: "drive:raw:upload", label: "Upload Raw Footage", description: "Upload files to 01_Raw_Footage" },
      { key: "drive:raw:delete", label: "Delete Raw Footage", description: "Destructive action - delete raw files" },
      { key: "drive:broll:view", label: "View B-Roll Assets", description: "Stream/download from 02_B_Roll_Assets" },
      { key: "drive:broll:upload", label: "Upload B-Roll Assets", description: "Upload files to 02_B_Roll_Assets" },
      { key: "drive:broll:delete", label: "Delete B-Roll Assets", description: "Destructive action - delete B-roll files" },
      { key: "storage:cleanup_trigger", label: "Trigger Storage Cleanup", description: "Access cleanup tool to wipe old iterations/raw files" },
    ],
  },
  {
    id: "review",
    label: "Iterations, Review & Feedback",
    permissions: [
      { key: "review:submission:upload", label: "Upload Submissions", description: "Upload V1, V2 cuts to 03_Submissions_Edits" },
      { key: "review:submission:view", label: "View Submissions", description: "Watch uploaded cuts in the player" },
      { key: "review:submission:delete_own", label: "Delete Own Submission", description: "Delete their own mistaken upload before review" },
      { key: "review:comment:create", label: "Add Review Comments", description: "Add timestamped, categorized feedback on a video" },
      { key: "review:comment:resolve", label: "Resolve Review Comments", description: "Mark timestamped feedback as addressed" },
      { key: "review:decision:reject", label: "Reject Submissions", description: "Click 'Request Revisions' to bounce task state back" },
      { key: "review:decision:approve", label: "Approve Submissions", description: "Click 'Approve', advancing task and routing to 04_Final_Exports" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// D. Helper Functions
// ─────────────────────────────────────────────────────────────

/**
 * Compute the effective permission set for a team member.
 * Merges implicit permissions from the primary submission task with
 * any explicit atomic permissions stored in the DB.
 */
export function getEffectivePermissions(
  primaryTask: string | null | undefined,
  explicitPermissions: string[]
): AtomicPermission[] {
  const implicit = getImplicitPermissionsForTask(primaryTask);

  const all = new Set<AtomicPermission>([
    ...implicit,
    ...(explicitPermissions as AtomicPermission[]),
  ]);

  return Array.from(all);
}

/**
 * Check if a user has a specific atomic permission.
 * Creator (admin:super) always returns true.
 */
export function hasPermission(
  effectivePermissions: AtomicPermission[] | string[],
  permission: AtomicPermission,
  isCreator: boolean
): boolean {
  if (isCreator) return true;
  return effectivePermissions.includes(permission) || effectivePermissions.includes("admin:super");
}

/**
 * Determine which permissions are implicitly granted vs. explicitly granted.
 * Used by the Settings UI to render greyed-out implicit toggles.
 */
export function classifyPermissions(
  primaryTask: string | null | undefined,
  explicitPermissions: string[]
): {
  implicit: Set<AtomicPermission>;
  explicit: Set<AtomicPermission>;
} {
  const implicit = new Set<AtomicPermission>(getImplicitPermissionsForTask(primaryTask));
  const explicit = new Set<AtomicPermission>(explicitPermissions as AtomicPermission[]);
  return { implicit, explicit };
}

/**
 * User permissions lookup utility (SPEC Prompt 10 Section 2)
 * Refactored getUserPermissions(userEmail, assignedTask)
 * When a user logs in, if they are assigned to a primary task,
 * they implicitly receive their minimal atomic strings merged with explicit DB permissions.
 */
export async function getUserPermissions(
  userEmail?: string | null,
  assignedTask?: string | null
): Promise<AtomicPermission[]> {
  if (!userEmail) return [];
  if (isCreatorEmail(userEmail)) {
    return ["admin:super"];
  }

  const normalized = userEmail.trim().toLowerCase();
  try {
    const dbRole = await prisma.role.findUnique({
      where: { email: normalized },
    });

    if (!dbRole) return [];

    let parsedPermissions: any = {};
    try {
      parsedPermissions = JSON.parse(dbRole.permissions);
    } catch {
      parsedPermissions = {};
    }

    const primaryTask =
      assignedTask ||
      (parsedPermissions.submission_tasks && parsedPermissions.submission_tasks.length > 0
        ? parsedPermissions.submission_tasks[0]
        : parsedPermissions.submission_task || null);

    return getEffectivePermissions(
      primaryTask,
      parsedPermissions.atomic_permissions || []
    );
  } catch (err) {
    console.error("Error in getUserPermissions:", err);
    return [];
  }
}
