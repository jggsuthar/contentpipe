import prisma from "@/lib/prisma";
import { getRoleConfigForContentType } from "@/lib/permissions";
import { AutomationTrigger, TaskStatus } from "@/types/database";

/**
 * Dynamic Task Automation Engine
 *
 * Decouples task names (e.g. "Script", "Edit", "Research") from app features.
 * Any task in a content type's workflow can be configured as "automatic" with one of:
 *  - 'script_studio': Syncs with Script Studio workspace status & review
 *  - 'drive_raw_footage': Syncs when Raw Footage is declared uploaded
 *  - 'content_submission': Syncs with Deliverable Submissions cuts and review decisions
 */
export async function syncTaskAutomation(
  contentItemId: string,
  trigger: AutomationTrigger,
  overrides?: {
    raw_footage_uploaded?: boolean;
    script_status?: string;
  }
): Promise<void> {
  try {
    const contentItem = await prisma.contentItem.findUnique({
      where: { id: contentItemId },
      include: {
        content_type: {
          include: {
            workflow_tasks: {
              where: {
                update_mode: "automatic",
                automation_trigger: trigger,
              },
            },
          },
        },
        script: true,
        submissions: {
          orderBy: { created_at: "desc" },
        },
        task_instances: true,
      },
    });

    if (!contentItem || !contentItem.content_type || !contentItem.publish_date) return;

    const automatedTasks = contentItem.content_type.workflow_tasks;
    if (automatedTasks.length === 0) {
      // No tasks in this content type are automated by this trigger
      return;
    }

    let targetStatus: TaskStatus = "not_done";

    if (trigger === "script_studio") {
      const scriptStatus = overrides?.script_status ?? contentItem.script?.status ?? "pending";

      // Check if any registered team member has scripting responsibility for this content type
      const allRoles = await prisma.role.findMany();
      const hasAssignedScriptWriter = allRoles.some((role) => {
        let perms: any = {};
        try {
          perms = JSON.parse(role.permissions || "{}");
        } catch {
          perms = {};
        }

        const config = getRoleConfigForContentType(perms, contentItem.content_type_id);
        const isResponsible =
          config.responsibilities?.scripting?.enabled === true ||
          perms.responsibilities?.scripting?.enabled === true;

        if (!isResponsible) return false;

        let assignedTypes: string[] = [];
        try {
          assignedTypes = JSON.parse(role.assigned_content_types || "[]");
        } catch {
          assignedTypes = [];
        }

        if (assignedTypes.length === 0 || assignedTypes.includes("ALL")) return true;
        return (
          (Boolean(contentItem.content_type_id) &&
            assignedTypes.includes(contentItem.content_type_id as string)) ||
          (Boolean(contentItem.content_type?.name) &&
            assignedTypes.includes(contentItem.content_type!.name))
        );
      });

      if (!hasAssignedScriptWriter) {
        // Case 1: Creator solo scriptwriting
        // Declared Done -> done; Not declared / Undeclared -> not_done
        targetStatus = scriptStatus === "done" ? "done" : "not_done";
      } else {
        // Case 2: Team member assigned with scripting responsibility
        // Pending / not submitted -> not_done
        // Submitted, not reviewed -> under_review
        // Revision requested -> revision_needed
        // Approved -> done
        if (scriptStatus === "done") {
          targetStatus = "done";
        } else if (scriptStatus === "revision_requested") {
          targetStatus = "revision_needed";
        } else if (scriptStatus === "submitted") {
          targetStatus = "under_review";
        } else {
          targetStatus = "not_done";
        }
      }
    } else if (trigger === "drive_raw_footage") {
      const isRawDone =
        overrides?.raw_footage_uploaded !== undefined
          ? overrides.raw_footage_uploaded
          : contentItem.raw_footage_uploaded;

      targetStatus = isRawDone ? "done" : "not_done";
    }

    const now = new Date();

    // Update each task assigned to this automation trigger
    for (const automatedTask of automatedTasks) {
      let taskTargetStatus: TaskStatus = targetStatus;

      // For Content Submission: evaluate based on that task's specific assigned role
      if (trigger === "content_submission") {
        const relevantSubmissions = automatedTask.automation_role_id
          ? contentItem.submissions.filter((s) => s.submitted_by_role_id === automatedTask.automation_role_id)
          : contentItem.submissions;

        const latestSub = relevantSubmissions[0];
        if (!latestSub) {
          taskTargetStatus = "not_done";
        } else if (latestSub.status === "approved") {
          taskTargetStatus = "done";
        } else if (latestSub.status === "rejected") {
          taskTargetStatus = "revision_needed";
        } else {
          // status is "pending" (submitted, awaiting review)
          taskTargetStatus = "under_review";
        }
      }

      const existingInstance = contentItem.task_instances.find(
        (ti) => ti.task_name.toLowerCase() === automatedTask.task_name.toLowerCase()
      );

      if (existingInstance) {
        await prisma.taskInstance.update({
          where: { id: existingInstance.id },
          data: {
            status: taskTargetStatus,
            completed_at: taskTargetStatus === "done" ? existingInstance.completed_at || now : null,
          },
        });
      } else {
        await prisma.taskInstance.create({
          data: {
            content_item_id: contentItem.id,
            task_name: automatedTask.task_name,
            status: taskTargetStatus,
            completed_at: taskTargetStatus === "done" ? now : null,
          },
        });
      }
    }

    // Automatically synchronize the fixed 'Publish' node for this content item
    await syncPublishTask(contentItemId);
  } catch (error) {
    console.error(`Error syncing task automation for trigger '${trigger}':`, error);
  }
}

/**
 * Automatically evaluates the fixed 'Publish' node for a content item:
 *  Check a: All previous visible tasks (Ideation through task immediately before Publish) are Done.
 *  Check b: The publish target date has arrived/passed (Today >= Publish Date).
 *
 * If both are true -> Publish is automatically Done.
 * Otherwise -> Publish is Pending (not_done).
 */
export async function syncPublishTask(contentItemId: string): Promise<void> {
  try {
    const contentItem = await prisma.contentItem.findUnique({
      where: { id: contentItemId },
      include: {
        content_type: {
          include: {
            workflow_tasks: {
              orderBy: { sequence_order: "asc" },
            },
          },
        },
        task_instances: true,
      },
    });

    if (!contentItem || !contentItem.content_type || !contentItem.publish_date) return;

    const allTasks = contentItem.content_type.workflow_tasks.filter((t) => !t.is_hidden);
    const publishTask = allTasks.find((t) => t.task_name.toLowerCase() === "publish");
    if (!publishTask) return;

    // Check a: Are all visible tasks before Publish in the sequence Done?
    const publishIndex = allTasks.findIndex((t) => t.id === publishTask.id);
    const priorTasks = allTasks.slice(0, publishIndex);

    let allPriorDone = true;
    for (const prior of priorTasks) {
      const priorKey = prior.task_name.toLowerCase();
      if (priorKey === "ideation") {
        const isIdeationDone = Boolean(contentItem.title && contentItem.unique_content_id);
        if (!isIdeationDone) {
          allPriorDone = false;
          break;
        }
      } else {
        const instance = contentItem.task_instances.find(
          (ti) => ti.task_name.toLowerCase() === priorKey
        );
        if (instance?.status !== "done") {
          allPriorDone = false;
          break;
        }
      }
    }

    // Check b: Has the target publish date passed? (Today >= Publish Date at day resolution)
    const pDate = new Date(contentItem.publish_date);
    pDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const publishDatePassed = today.getTime() >= pDate.getTime();

    const targetPublishStatus: TaskStatus = allPriorDone && publishDatePassed ? "done" : "not_done";
    const now = new Date();

    const existingPublishInstance = contentItem.task_instances.find(
      (ti) => ti.task_name.toLowerCase() === "publish"
    );

    if (existingPublishInstance) {
      if (existingPublishInstance.status !== targetPublishStatus) {
        await prisma.taskInstance.update({
          where: { id: existingPublishInstance.id },
          data: {
            status: targetPublishStatus,
            completed_at: targetPublishStatus === "done" ? existingPublishInstance.completed_at || now : null,
          },
        });
      }
    } else {
      await prisma.taskInstance.create({
        data: {
          content_item_id: contentItem.id,
          task_name: publishTask.task_name,
          status: targetPublishStatus,
          completed_at: targetPublishStatus === "done" ? now : null,
        },
      });
    }
  } catch (error) {
    console.error("Error evaluating automatic Publish task status:", error);
  }
}
