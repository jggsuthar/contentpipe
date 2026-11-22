import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getUserEffectivePermissions } from "@/lib/constants/users";
import {
  hasPermission as checkPermissionBool,
  AtomicPermission,
} from "@/lib/permissions";

/**
 * Server-side guard: verify the request is authenticated and belongs to the Creator Master.
 */
export async function verifyCreatorApi() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "creator") {
    return {
      authorized: false as const,
      response: NextResponse.json(
        { error: "Forbidden: Creator Master access required." },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true as const,
    session,
  };
}

/**
 * Server-side guard: verify the request is authenticated AND the user holds
 * a specific atomic permission string.
 *
 * Creator always passes (admin:super bypass).
 * Returns { authorized: true, session, isCreator, effectivePermissions }
 *      or { authorized: false, response } with a 401/403 NextResponse.
 */
export async function verifyPermission(permission: AtomicPermission) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const email = session.user.email;
  const { isCreator, permissions: effectivePermissions } =
    await getUserEffectivePermissions(email);

  if (!checkPermissionBool(effectivePermissions, permission, isCreator)) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        {
          error: `Forbidden: requires '${permission}' permission.`,
        },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true as const,
    session,
    isCreator,
    effectivePermissions,
  };
}

/**
 * Direct boolean checker for an atomic permission matching the current session.
 * e.g. if (await hasPermission('tracker:row:edit_title')) { ... }
 */
export async function hasPermission(permission: AtomicPermission): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return false;
  }

  const { isCreator, permissions: effectivePermissions } =
    await getUserEffectivePermissions(session.user.email);

  return checkPermissionBool(effectivePermissions, permission, isCreator);
}

/**
 * Convenience: Check if the current session user has a given permission,
 * without returning a response. Returns { isCreator, allowed, effectivePermissions, session }.
 */
export async function checkPermission(permission: AtomicPermission) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return { isCreator: false, allowed: false, effectivePermissions: [] as string[] };
  }

  const { isCreator, permissions: effectivePermissions } =
    await getUserEffectivePermissions(session.user.email);

  return {
    isCreator,
    allowed: checkPermissionBool(effectivePermissions, permission, isCreator),
    effectivePermissions,
    session,
  };
}
