import { isCreatorEmail } from "@/lib/constants/users";
import type { DbWeeklyDayBounds, ResistanceLevel } from "@/types/database";

export const DEFAULT_WORK_START_MINUTE = 480; // 08:00 AM
export const DEFAULT_WORK_END_MINUTE = 1080; // 06:00 PM
export const OPEN_WORKDAY_ZONE_ID = "__open_workday__";

export function buildNormalizedDayBounds(
  rows: {
    id?: string;
    userId: string;
    dayOfWeek: number;
    workStartMinute: number;
    workEndMinute: number;
  }[],
  userId = "creator"
): DbWeeklyDayBounds[] {
  const byDay = new Map<number, DbWeeklyDayBounds>();
  for (const r of rows) {
    if (r.dayOfWeek >= 0 && r.dayOfWeek <= 6) {
      byDay.set(r.dayOfWeek, {
        id: r.id,
        userId: r.userId,
        dayOfWeek: r.dayOfWeek,
        workStartMinute: Math.max(0, Math.min(1440, r.workStartMinute)),
        workEndMinute: Math.max(0, Math.min(1440, r.workEndMinute)),
      });
    }
  }
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    return (
      byDay.get(dayOfWeek) || {
        userId,
        dayOfWeek,
        workStartMinute: DEFAULT_WORK_START_MINUTE,
        workEndMinute: DEFAULT_WORK_END_MINUTE,
      }
    );
  });
}

interface SessionLike {
  user?: {
    email?: string | null;
    role?: "creator" | "team" | null;
    roleId?: string;
  } | null;
}

/**
 * Resolves the PWS scheduling userId from an authenticated NextAuth session.
 * Creator maps to "creator" (matching the Prisma schema default).
 */
export function resolveScheduleUserId(session: SessionLike | null | undefined): string {
  const email = session?.user?.email?.trim().toLowerCase();
  if (session?.user?.role === "creator" || isCreatorEmail(email)) {
    return "creator";
  }
  return session?.user?.roleId || email || "creator";
}

/**
 * Resolves the target PWS scheduling userId, allowing the Creator to view or manage
 * a TeamMember's schedule when `requestedTargetUserId` is passed.
 */
export function resolveTargetScheduleUserId(
  session: SessionLike | null | undefined,
  requestedTargetUserId?: unknown
): { authorized: true; userId: string; isCreator: boolean } | { authorized: false; error: string } {
  const callerUserId = resolveScheduleUserId(session);
  const isCreator =
    session?.user?.role === "creator" || isCreatorEmail(session?.user?.email);

  const requested =
    typeof requestedTargetUserId === "string" && requestedTargetUserId.trim()
      ? requestedTargetUserId.trim()
      : callerUserId;

  if (requested !== callerUserId && !isCreator) {
    return {
      authorized: false,
      error: "Forbidden: Only the Creator can manage schedules for other team members",
    };
  }

  return { authorized: true, userId: requested, isCreator };
}

/**
 * Safely parses eligibleZoneIds from either a JSON string or string array.
 */
export function parseEligibleZoneIds(value: unknown): string[] {
  let rawList: unknown[] = [];
  if (Array.isArray(value)) {
    rawList = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) rawList = parsed;
    } catch {
      rawList = [];
    }
  }

  const seen = new Set<string>();
  const clean: string[] = [];
  for (const item of rawList) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        clean.push(trimmed);
      }
    }
  }
  return clean;
}

/**
 * Normalizes task cognitive/physical resistance level.
 */
export function normalizeResistance(
  value: unknown,
  fallback: ResistanceLevel = "MEDIUM"
): ResistanceLevel {
  if (typeof value === "string") {
    const upper = value.trim().toUpperCase();
    if (upper === "LOW" || upper === "MEDIUM" || upper === "HIGH") {
      return upper;
    }
  }
  return fallback;
}

/**
 * Serializes a Prisma WorkflowTask row so eligibleZoneIds is returned as string[]
 * and resistance is normalized.
 */
export function serializeWorkflowTask<
  T extends {
    eligibleZoneIds?: string | string[] | null;
    resistance?: string | null;
  },
>(wt: T) {
  return {
    ...wt,
    resistance: normalizeResistance(wt.resistance, "MEDIUM"),
    eligibleZoneIds: parseEligibleZoneIds(wt.eligibleZoneIds),
  };
}

/**
 * Extracts validated PWS scheduling fields for Prisma WorkflowTask create/update.
 * When `partial` is true, omitted fields stay `undefined` so existing DB values are preserved.
 */
export function extractWorkflowTaskPwsData(
  input: Record<string, unknown>,
  partial = false
) {
  const durationMins =
    input.durationMins !== undefined
      ? Math.max(5, Math.round(Number(input.durationMins) || 5))
      : partial
      ? undefined
      : 60;

  const setupBufferMins =
    input.setupBufferMins !== undefined
      ? Math.max(0, Math.round(Number(input.setupBufferMins) || 0))
      : partial
      ? undefined
      : 15;

  const isSplittable =
    input.isSplittable !== undefined
      ? Boolean(input.isSplittable)
      : partial
      ? undefined
      : false;

  const minSplitChunkMins =
    input.minSplitChunkMins !== undefined
      ? Math.max(5, Math.round(Number(input.minSplitChunkMins) || 30))
      : partial
      ? undefined
      : 30;

  const resistance =
    input.resistance !== undefined
      ? normalizeResistance(input.resistance, "MEDIUM")
      : partial
      ? undefined
      : "MEDIUM";

  const eligibleZoneIds =
    input.eligibleZoneIds !== undefined
      ? JSON.stringify(parseEligibleZoneIds(input.eligibleZoneIds))
      : partial
      ? undefined
      : "[]";

  return {
    durationMins,
    setupBufferMins,
    isSplittable,
    minSplitChunkMins,
    resistance,
    eligibleZoneIds,
  };
}

/**
 * Previously seeded default zones; intentionally disabled so users start with zero
 * default zones and can treat the whole working day as a single open zone whenever empty.
 */
export async function ensureDefaultScheduleZonesForUser(_userId = "creator") {
  void _userId;
  return;
}
