/**
 * Cadence & Future Placeholder Schedule Generator
 * Matches SPEC.md Section 3.2 C: Repeatable Timetable & Cadence
 */

export interface CadenceConfig {
  cadence_type: "weekly" | "biweekly" | "triweekly" | "quadrupleweekly";
  cadence_start_date?: Date | string | null;
  upload_days: string[]; // e.g. ["Tuesday", "Saturday"]
  default_months_open?: number; // 1 to 6
}

const DAY_NAME_TO_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const INDEX_TO_DAY_NAME = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Returns an array of target Publish Dates based on the Content Type cadence.
 */
export function generateFuturePublishDates(
  config: CadenceConfig,
  horizonMonths: number = 3,
  referenceDate: Date = new Date()
): Date[] {
  const dates: Date[] = [];
  const uploadDays = config.upload_days || ["Tuesday"];

  const cycleIntervalWeeks =
    config.cadence_type === "biweekly"
      ? 2
      : config.cadence_type === "triweekly"
      ? 3
      : config.cadence_type === "quadrupleweekly"
      ? 4
      : 1;

  // Check if upload_days contains multi-week tags like "W1-Tuesday", "W2-Friday"
  const hasMultiWeekTags = uploadDays.some((d) => /^W\d+-/i.test(d));

  // Legacy fallback day indices for single-week cadence
  const targetDayIndices = uploadDays.map((d) => {
    const cleanDay = d.replace(/^W\d+-/i, "").toLowerCase().trim();
    return DAY_NAME_TO_INDEX[cleanDay] !== undefined ? DAY_NAME_TO_INDEX[cleanDay] : 2;
  });

  // Use UTC Noon (12:00:00Z) for all calendar dates so date keys (YYYY-MM-DD)
  // never shift across timezones (e.g. IST vs UTC).
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();
  const refDay = referenceDate.getDate();

  // Anchor date for multi-week cycles (default to start date or reference date)
  const rawAnchor = config.cadence_start_date
    ? new Date(config.cadence_start_date)
    : null;
  const anchorDate = rawAnchor
    ? new Date(
        Date.UTC(
          rawAnchor.getUTCFullYear(),
          rawAnchor.getUTCMonth(),
          rawAnchor.getUTCDate(),
          12,
          0,
          0,
          0
        )
      )
    : new Date(Date.UTC(refYear, refMonth, refDay, 12, 0, 0, 0));

  // Align anchor to the start of its week (Sunday) in UTC
  anchorDate.setUTCDate(anchorDate.getUTCDate() - anchorDate.getUTCDay());

  // Calculate rolling horizon end date: covers the next `horizonMonths` full calendar months
  const horizonEndDate = new Date(
    Date.UTC(refYear, refMonth + horizonMonths, 0, 23, 59, 59, 999)
  );

  // Start checking from UTC Noon of referenceDate
  const current = new Date(Date.UTC(refYear, refMonth, refDay, 12, 0, 0, 0));

  // Walk day by day up to horizonEndDate
  while (current <= horizonEndDate) {
    const dayOfWeek = current.getUTCDay();
    const dayName = INDEX_TO_DAY_NAME[dayOfWeek];

    // Calculate which week of the cycle this date falls into (1, 2, 3, or 4)
    const msDiff = current.getTime() - anchorDate.getTime();
    const daysDiff = Math.round(msDiff / (1000 * 60 * 60 * 24));
    const weekDiff = Math.floor(daysDiff / 7);
    const cycleWeekNumber =
      cycleIntervalWeeks === 1
        ? 1
        : (((weekDiff % cycleIntervalWeeks) + cycleIntervalWeeks) % cycleIntervalWeeks) + 1;

    if (hasMultiWeekTags) {
      // Check for exact "W{cycleWeekNumber}-{Day}" match
      const targetTag = `W${cycleWeekNumber}-${dayName}`.toLowerCase();
      const isMatch = uploadDays.some((d) => d.toLowerCase().trim() === targetTag);
      if (isMatch) {
        dates.push(new Date(current));
      }
    } else {
      // Legacy behavior: check target days on Week 1 of the cycle
      if (cycleWeekNumber === 1 && targetDayIndices.includes(dayOfWeek)) {
        dates.push(new Date(current));
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export interface CadenceMatchResult {
  matches: boolean;
  reason: string;
  expectedDaysStr: string;
}

/**
 * Checks whether a given publish date adheres to the current Content Type cadence timetable.
 */
export function checkDateCadenceMatch(
  targetDate: Date | string,
  config: CadenceConfig
): CadenceMatchResult {
  const rawDate = typeof targetDate === "string" ? new Date(targetDate) : targetDate;
  const checkDate = new Date(
    Date.UTC(
      rawDate.getUTCFullYear(),
      rawDate.getUTCMonth(),
      rawDate.getUTCDate(),
      12,
      0,
      0,
      0
    )
  );
  const uploadDays =
    config.upload_days && config.upload_days.length > 0 ? config.upload_days : ["Tuesday"];
  const dayOfWeek = checkDate.getUTCDay();
  const dayName = INDEX_TO_DAY_NAME[dayOfWeek];

  const cycleIntervalWeeks =
    config.cadence_type === "biweekly"
      ? 2
      : config.cadence_type === "triweekly"
      ? 3
      : config.cadence_type === "quadrupleweekly"
      ? 4
      : 1;

  const hasMultiWeekTags = uploadDays.some((d) => /^W\d+-/i.test(d));

  // Anchor date for multi-week cycles
  const rawAnchor = config.cadence_start_date
    ? new Date(config.cadence_start_date)
    : new Date();
  const anchorDate = new Date(
    Date.UTC(
      rawAnchor.getUTCFullYear(),
      rawAnchor.getUTCMonth(),
      rawAnchor.getUTCDate(),
      12,
      0,
      0,
      0
    )
  );
  anchorDate.setUTCDate(anchorDate.getUTCDate() - anchorDate.getUTCDay());

  const msDiff = checkDate.getTime() - anchorDate.getTime();
  const daysDiff = Math.round(msDiff / (1000 * 60 * 60 * 24));
  const weekDiff = Math.floor(daysDiff / 7);
  const cycleWeekNumber =
    cycleIntervalWeeks === 1
      ? 1
      : (((weekDiff % cycleIntervalWeeks) + cycleIntervalWeeks) % cycleIntervalWeeks) + 1;

  let matches = false;
  let matchedTag = "";

  if (hasMultiWeekTags) {
    const targetTag = `W${cycleWeekNumber}-${dayName}`.toLowerCase();
    const isMatch = uploadDays.some((d) => d.toLowerCase().trim() === targetTag);
    if (isMatch) {
      matches = true;
      matchedTag = `W${cycleWeekNumber}-${dayName}`;
    }
  } else {
    const targetDayIndices = uploadDays.map((d) => {
      const cleanDay = d.replace(/^W\d+-/i, "").toLowerCase().trim();
      return DAY_NAME_TO_INDEX[cleanDay] !== undefined ? DAY_NAME_TO_INDEX[cleanDay] : 2;
    });

    if (cycleIntervalWeeks === 1) {
      if (targetDayIndices.includes(dayOfWeek)) {
        matches = true;
        matchedTag = dayName;
      }
    } else {
      if (cycleWeekNumber === 1 && targetDayIndices.includes(dayOfWeek)) {
        matches = true;
        matchedTag = `Week 1 (${dayName})`;
      }
    }
  }

  const expectedDaysStr = uploadDays.join(", ");

  if (matches) {
    return {
      matches: true,
      reason: `Matches current ${config.cadence_type || "weekly"} cadence (${matchedTag})`,
      expectedDaysStr,
    };
  }

  return {
    matches: false,
    reason: `Falls on ${dayName} (Cycle W${cycleWeekNumber}), expected: ${expectedDaysStr}`,
    expectedDaysStr,
  };
}
