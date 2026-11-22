import prisma from "@/lib/prisma";
import { RolePermissions } from "@/types/database";
import { getEffectivePermissions, getUserPermissions } from "@/lib/permissions";

export { getUserPermissions };

export type UserRole = "creator" | "team";

export interface UserAuthProfile {
  email: string;
  name: string;
  role: UserRole;
  title: string;
  roleId?: string;
  permissions?: RolePermissions;
  assignedContentTypes?: string[];
}

/**
 * Check if the given email is the Master Creator.
 * Strictly checks process.env.CREATOR_EMAIL only.
 */
export function isCreatorEmail(email?: string | null): boolean {
  if (!email) return false;
  const creatorEnv = process.env.CREATOR_EMAIL?.trim().toLowerCase();
  return Boolean(creatorEnv && email.trim().toLowerCase() === creatorEnv);
}

/**
 * Dynamically queries the database for an authorized user (Creator or registered Team Member).
 * Returns full profile or null if unmapped / unauthorized.
 *
 * For team members the returned permissions object includes:
 *  - All legacy fields (can_view, can_edit, etc.) for backwards compatibility
 *  - atomic_permissions: explicitly stored permissions from DB
 *  - effective_permissions: merged implicit (from primary submission task) + explicit
 */
export async function getDynamicUserProfile(
  email?: string | null
): Promise<UserAuthProfile | null> {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();

  // 1. Check Master Creator (strictly defined via CREATOR_EMAIL)
  if (isCreatorEmail(normalized)) {
    return {
      email: normalized,
      name: "Channel Creator",
      role: "creator",
      title: "Channel Owner & Master",
      permissions: {
        can_view: true,
        can_edit: true,
        can_contribute: true,
        can_submit: true,
        // Creator has atomic super permission; effective_permissions not needed
        // because all hasPermission() checks return true for isCreator = true
        atomic_permissions: ["admin:super"],
        effective_permissions: ["admin:super"],
      },
      assignedContentTypes: ["ALL"],
    };
  }

  // 2. Query 'roles' table dynamically for team members
  try {
    const dbRole = await prisma.role.findUnique({
      where: { email: normalized },
    });

    if (dbRole) {
      let parsedPermissions: RolePermissions = {};
      let parsedContentTypes: string[] = [];

      try {
        parsedPermissions = JSON.parse(dbRole.permissions);
      } catch {
        parsedPermissions = {};
      }

      try {
        parsedContentTypes = JSON.parse(dbRole.assigned_content_types);
      } catch {
        parsedContentTypes = [];
      }

      // Resolve primary task from submission_tasks[0] or fallback to submission_task
      const primaryTask =
        parsedPermissions.submission_tasks && parsedPermissions.submission_tasks.length > 0
          ? parsedPermissions.submission_tasks[0]
          : parsedPermissions.submission_task || null;

      // Compute effective permissions: implicit(primaryTask) ∪ explicit(atomic_permissions)
      const effectivePermissions = getEffectivePermissions(
        primaryTask,
        parsedPermissions.atomic_permissions || []
      );

      return {
        email: dbRole.email,
        name: dbRole.name,
        role: "team",
        roleId: dbRole.id,
        title: dbRole.role_title,
        permissions: {
          ...parsedPermissions,
          effective_permissions: effectivePermissions,
        },
        assignedContentTypes: parsedContentTypes,
      };
    }
  } catch (error) {
    console.error("Database error looking up role for email:", normalized, error);
  }

  // 3. Unmapped account
  return null;
}

/**
 * Convenience helper for API routes — returns the effective permission array
 * (or ["admin:super"] for Creator) without needing to spread the full profile.
 */
export async function getUserEffectivePermissions(
  email?: string | null
): Promise<{ isCreator: boolean; permissions: string[] }> {
  if (isCreatorEmail(email)) {
    return { isCreator: true, permissions: ["admin:super"] };
  }

  const profile = await getDynamicUserProfile(email);
  return {
    isCreator: false,
    permissions: profile?.permissions?.effective_permissions || [],
  };
}
