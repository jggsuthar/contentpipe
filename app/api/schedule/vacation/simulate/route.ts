import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveTargetScheduleUserId } from "@/lib/schedule-seed";
import { enumerateDates } from "@/lib/scheduler-engine";
import { simulateVacationModels } from "@/lib/vacation-scheduler";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/schedule/vacation/simulate
 * Runs the 4-Model Vacation Pre-Scheduling Engine over [vacationStart, vacationEnd].
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const resolved = resolveTargetScheduleUserId(session, body?.targetUserId);
    if (!resolved.authorized) {
      return NextResponse.json({ error: resolved.error }, { status: 403 });
    }

    const vacationStart =
      typeof body?.vacationStart === "string" ? body.vacationStart.trim() : "";
    const vacationEnd =
      typeof body?.vacationEnd === "string" ? body.vacationEnd.trim() : "";
    const holidayLabel =
      typeof body?.holidayLabel === "string" && body.holidayLabel.trim()
        ? body.holidayLabel.trim()
        : "Vacation";

    if (!DATE_RE.test(vacationStart) || !DATE_RE.test(vacationEnd)) {
      return NextResponse.json(
        { error: "vacationStart and vacationEnd must be YYYY-MM-DD strings" },
        { status: 400 }
      );
    }

    if (vacationStart > vacationEnd) {
      return NextResponse.json(
        { error: "vacationStart must be on or before vacationEnd" },
        { status: 400 }
      );
    }

    const days = enumerateDates(vacationStart, vacationEnd).length;
    if (days > 45) {
      return NextResponse.json(
        { error: "Vacation window cannot exceed 45 days per simulation" },
        { status: 400 }
      );
    }

    const result = await simulateVacationModels({
      userId: resolved.userId,
      vacationStart,
      vacationEnd,
      holidayLabel,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error simulating vacation models:", error);
    return NextResponse.json(
      { error: "Failed to run 4-model vacation simulation" },
      { status: 500 }
    );
  }
}
