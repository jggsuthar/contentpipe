/**
 * The Task Engine: Target Date Math (P - \sum n), 4-State Lifecycle,
 * Strict Sequential Validation, and Archive Rules.
 * Matches SPEC.md Sections 3.2 B, 3.2 D, and 4.4.
 */

export interface WorkflowTaskDefinition {
  id: string;
  task_name: string;
  sequence_order: number;
  n_days_offset: number;
  team_buffer_days: number;
  team_final_buffer_days: number;
  is_hidden: boolean;
  color?: string | null;
  update_mode?: string | null;
  automation_trigger?: string | null;
  automation_role_id?: string | null;
  require_closure_link?: boolean;
  durationMins?: number;
  setupBufferMins?: number;
  isSplittable?: boolean;
  minSplitChunkMins?: number;
  resistance?: "LOW" | "MEDIUM" | "HIGH" | string;
  eligibleZoneIds?: string[] | string;
}

export interface CalculatedTaskDates {
  task_name: string;
  sequence_order: number;
  target_date_worst_case: Date;
  target_date_team_1st: Date;
  target_date_team_final: Date;
  target_date_team: Date; // Primary team deadline shown to team member
  cumulative_offset_days: number;
}

/**
 * Calculates Creator Worst-Case Target Date (P - \sum n) and Team Buffered Dates.
 *
 * Formula per SPEC.md Section 3.2 B:
 * Worst-Case Date_k = P - \sum_{i=k}^{end} n_i
 * Team 1st Sub Date_k = Worst-Case Date_k - team_buffer_days_k
 * Team Final Sub Date_k = Worst-Case Date_k - team_final_buffer_days_k
 */
export function calculateTaskTargetDates(
  publishDate: Date,
  workflowTasks: WorkflowTaskDefinition[]
): Map<string, CalculatedTaskDates> {
  const sorted = [...workflowTasks].sort((a, b) => a.sequence_order - b.sequence_order);
  const result = new Map<string, CalculatedTaskDates>();

  for (let k = 0; k < sorted.length; k++) {
    const currentTask = sorted[k];

    // Cumulative n days from this task to Publish
    const cumulativeN = sorted
      .slice(k)
      .reduce((acc, t) => acc + (t.n_days_offset || 0), 0);

    // Worst-Case Date = Publish Date - cumulativeN days
    const worstCaseDate = new Date(publishDate);
    worstCaseDate.setDate(worstCaseDate.getDate() - cumulativeN);

    // Team 1st Submission Date = Worst-Case Date - team_buffer_days
    const team1stDate = new Date(worstCaseDate);
    team1stDate.setDate(team1stDate.getDate() - (currentTask.team_buffer_days || 0));

    // Team Final Submission Date = Worst-Case Date - team_final_buffer_days
    const teamFinalDate = new Date(worstCaseDate);
    teamFinalDate.setDate(teamFinalDate.getDate() - (currentTask.team_final_buffer_days || 0));

    result.set(currentTask.task_name.toLowerCase(), {
      task_name: currentTask.task_name,
      sequence_order: currentTask.sequence_order,
      target_date_worst_case: worstCaseDate,
      target_date_team_1st: team1stDate,
      target_date_team_final: teamFinalDate,
      target_date_team: team1stDate,
      cumulative_offset_days: cumulativeN,
    });
  }

  return result;
}

/**
 * Validates whether a workflow task is allowed to transition to 'done'.
 *
 * Rule per SPEC.md Section 4.4 Rule 1:
 * "In the Main Workflow, a task cannot be marked Done unless the visible task
 * immediately before it is marked Done. (Hidden tasks are skipped)."
 */
export function validateSequentialDependency(
  targetTaskName: string,
  workflowTasks: WorkflowTaskDefinition[],
  currentTaskStatuses: { task_name: string; status: string }[]
): { allowed: boolean; blockingTaskName?: string; reason?: string } {
  const normalizedTarget = targetTaskName.trim().toLowerCase();

  // Ideation cannot be manually checked; it is locked to title existence
  if (normalizedTarget === "ideation") {
    return {
      allowed: false,
      reason: "Ideation is automated and marks as Done only when a video title is registered.",
    };
  }

  const sorted = [...workflowTasks].sort((a, b) => a.sequence_order - b.sequence_order);
  const targetTaskIndex = sorted.findIndex(
    (t) => t.task_name.toLowerCase() === normalizedTarget
  );

  if (targetTaskIndex === -1) {
    return { allowed: false, reason: `Task '${targetTaskName}' not found in workflow.` };
  }

  const targetTask = sorted[targetTaskIndex];

  // Find the immediate visible predecessor (skip hidden tasks)
  let immediatePredecessor: WorkflowTaskDefinition | null = null;
  for (let i = targetTaskIndex - 1; i >= 0; i--) {
    if (!sorted[i].is_hidden) {
      immediatePredecessor = sorted[i];
      break;
    }
  }

  if (immediatePredecessor) {
    const predecessorStatusObj = currentTaskStatuses.find(
      (t) => t.task_name.toLowerCase() === immediatePredecessor!.task_name.toLowerCase()
    );

    const isPredecessorDone = predecessorStatusObj?.status === "done";

    if (!isPredecessorDone) {
      return {
        allowed: false,
        blockingTaskName: immediatePredecessor.task_name,
        reason: `Cannot mark '${targetTask.task_name}' as Done until '${immediatePredecessor.task_name}' is completed.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Evaluates whether a placeholder row is eligible for Archiving.
 *
 * Rules per SPEC.md Section 4.4 Rule 2:
 * A placeholder row can only be moved to the Archive when ALL THREE conditions are met:
 * 1. All Main Workflow Tasks (Ideation through Publish) are marked Done.
 * 2. All Misc. Tasks for that video are marked Done.
 * 3. The video's scheduled Publish Date has passed (Today >= Publish Date).
 */
export function checkArchiveEligibility(
  publishDate: Date | string,
  workflowTasks: WorkflowTaskDefinition[],
  currentTaskStatuses: { task_name: string; status: string }[],
  miscTasksStatus: { task_name: string; is_done: boolean }[] = [],
  requiredMiscTasks: { task_name: string }[] = [],
  referenceDate: Date = new Date()
): {
  isEligible: boolean;
  workflowDone: boolean;
  miscDone: boolean;
  publishDatePassed: boolean;
  missingRequirements: string[];
} {
  const missingRequirements: string[] = [];

  // Condition 1: All visible workflow tasks must be 'done'
  const visibleTasks = workflowTasks.filter((t) => !t.is_hidden);
  let workflowDone = true;

  for (const wt of visibleTasks) {
    const statusObj = currentTaskStatuses.find(
      (t) => t.task_name.toLowerCase() === wt.task_name.toLowerCase()
    );
    if (statusObj?.status !== "done") {
      workflowDone = false;
      missingRequirements.push(`Workflow task '${wt.task_name}' is not Done`);
    }
  }

  // Condition 2: All Misc tasks configured for this Content Type must be marked Done
  let miscDone = true;
  for (const mt of requiredMiscTasks) {
    const statusObj = miscTasksStatus.find(
      (m) => m.task_name.toLowerCase() === mt.task_name.toLowerCase()
    );
    if (!statusObj?.is_done) {
      miscDone = false;
      missingRequirements.push(`Misc task '${mt.task_name}' is not Done`);
    }
  }

  // Condition 3: Publish Date has passed (Today >= Publish Date)
  const pDate = new Date(publishDate);
  pDate.setHours(0, 0, 0, 0);

  const ref = new Date(referenceDate);
  ref.setHours(23, 59, 59, 999);

  const publishDatePassed = ref.getTime() >= pDate.getTime();
  if (!publishDatePassed) {
    missingRequirements.push("Scheduled publish date has not yet passed");
  }

  const isEligible = workflowDone && miscDone && publishDatePassed;

  return {
    isEligible,
    workflowDone,
    miscDone,
    publishDatePassed,
    missingRequirements,
  };
}
