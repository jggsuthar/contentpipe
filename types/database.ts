/**
 * TypeScript Interfaces and Enums for Creator Production & Register System
 * Derived from SPEC.md Phase 1, Step 2
 */

export type TaskStatus = "not_done" | "under_review" | "revision_needed" | "done";

export type SubmissionStatus = "pending" | "rejected" | "approved";

export type CommentCategory =
  | "Pacing"
  | "Audio"
  | "B-Roll"
  | "Typography"
  | "Retention Hook"
  | "Brand SOP Miss"
  | "General";

export type CommentSeverity = "minor" | "critical";

export type CadenceType = "weekly" | "biweekly" | "triweekly" | "quadrupleweekly";

export type IdGenerationType = "sequential" | "date_counter";

export type AccessLevel = "none" | "view" | "edit";
export type TargetDateAccessLevel = "none" | "view";

export type TeamResponsibilityType = "scripting" | "content_submission";

export interface TeamResponsibilityConfig {
  enabled: boolean;
  target_task_name?: string;
}

export interface IndexPermissions {
  content_name: AccessLevel;
  tasks: Record<string, AccessLevel>;
  task_target_date: TargetDateAccessLevel;
  archive?: AccessLevel;
  script_studio_access?: AccessLevel;
}

export interface ScriptStudioPermissions {
  access: AccessLevel;
}

export interface SubmissionPermissions {
  disabled?: boolean;
  can_view_own?: boolean;
  can_view_others?: boolean;
  allowed_other_role_ids?: string[];
  can_submit?: boolean;
}

export interface ContentPermissions {
  folders: Record<string, AccessLevel>;
  can_submit?: boolean;
  submission?: SubmissionPermissions;
}

export interface ContentTypeRoleConfig {
  responsibilities?: {
    scripting?: TeamResponsibilityConfig;
    content_submission?: TeamResponsibilityConfig;
  };
  index?: IndexPermissions;
  script_studio?: ScriptStudioPermissions;
  content?: ContentPermissions;
}

export interface RolePermissions {
  responsibilities?: {
    scripting?: TeamResponsibilityConfig;
    content_submission?: TeamResponsibilityConfig;
  };
  index?: IndexPermissions;
  script_studio?: ScriptStudioPermissions;
  content?: ContentPermissions;

  // Multi-content-type granular settings map: contentTypeId -> ContentTypeRoleConfig
  by_content_type?: Record<string, ContentTypeRoleConfig>;

  // Legacy / backwards compatibility fields
  can_view?: boolean;
  can_edit?: boolean;
  can_contribute?: boolean;
  can_submit?: boolean;
  submission_task?: string;
  submission_tasks?: string[];
  allowed_tasks?: string[];
  atomic_permissions?: string[];
  effective_permissions?: string[];
  [key: string]: any;
}

export interface CustomActionItem {
  id: string;
  text: string;
  is_closed: boolean;
  created_at?: string;
}

export interface MiscTaskStatusItem {
  task_name: string;
  is_done: boolean;
}

export interface ScriptColumnSchema {
  id: string;
  name: string;
  type: "text" | "dropdown";
  width?: string;
  options?: string[]; // Predefined options if type === 'dropdown'
  is_hidden?: boolean;
}

export interface FolderArchitectureItem {
  id: string;
  name: string;
  parent_id?: string | null;
}

export interface ScriptRowData {
  sr_no: number;
  dialogue?: string;
  roll_type?: string; // e.g., "A-Roll", "B-Roll", "Screen Recording"
  description?: string;
  remarks?: string;
  [custom_field: string]: unknown;
}

// -------------------------------------------------------------
// Core Domain Models
// -------------------------------------------------------------

export interface DbRole {
  id: string;
  name: string;
  email: string;
  role_title: string;
  assigned_content_types: string[]; // parsed from JSON
  permissions: RolePermissions; // parsed from JSON
  created_at: Date;
  updated_at: Date;
}

export interface DbBrand {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  color: string | null;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface DbContentType {
  id: string;
  brand_id?: string | null;
  brand?: Pick<DbBrand, "id" | "name" | "color"> | null;
  name: string;
  prefix: string | null;
  suffix: string | null;
  id_generation_type: IdGenerationType;
  default_months_open: number;
  cadence_type: CadenceType;
  cadence_start_date: Date | null;
  upload_days: string[]; // parsed from JSON e.g. ["Tuesday", "Saturday"]
  script_default_columns: ScriptColumnSchema[] | null; // parsed from JSON
  default_folder_architecture?: FolderArchitectureItem[] | null; // parsed from JSON
  created_at: Date;
}

export type TaskUpdateMode = "manual" | "automatic";
export type AutomationTrigger = "script_studio" | "drive_raw_footage" | "content_submission";

export interface DbWorkflowTask {
  id: string;
  content_type_id: string;
  task_name: string;
  sequence_order: number;
  n_days_offset: number; // Worst-case days needed from Publish (n)
  team_buffer_days: number; // 1st submission deadline offset
  team_final_buffer_days: number; // Final submission buffer offset
  is_hidden: boolean;
  color?: string | null;
  update_mode?: TaskUpdateMode;
  automation_trigger?: AutomationTrigger | null;
  automation_role_id?: string | null;
  require_closure_link?: boolean;
}

export type WorkflowTask = DbWorkflowTask;

export interface DbMiscTask {
  id: string;
  content_type_id: string;
  task_name: string;
}

export interface DriveFolders {
  main_folder_id?: string;
  main_folder_url?: string;
  raw_footage_id?: string;
  raw_footage_url?: string;
  b_roll_id?: string;
  b_roll_url?: string;
  submissions_id?: string;
  submissions_url?: string;
  final_exports_id?: string;
  final_exports_url?: string;
  folder_ids?: Record<string, string>; // maps folder architecture item id or name -> drive folder id
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  sizeBytes?: number;
  webViewLink?: string;
  directDownloadUrl?: string;
  createdTime?: string | null;
  thumbnailLink?: string | null;
}

export interface RawAssetItem {
  id: string;
  name: string;
  file_url?: string;
  drive_file_id?: string;
  size_bytes?: number;
  folder_type: "raw" | "b_roll" | "final";
  uploaded_by?: string;
  uploaded_at: string;
}

export interface DbContentItem {
  id: string;
  unique_content_id: string | null;
  content_type_id: string | null;
  brand_id?: string | null;
  title: string | null;
  excerpt?: string | null;
  idea_status?: string | null;
  is_in_idea_bank?: boolean;
  is_pinned?: boolean;
  ideation_date: Date | null;
  publish_date: Date | null;
  is_archived: boolean;
  remarks: string | null;
  published_url?: string | null;
  custom_action_items: CustomActionItem[]; // parsed from JSON
  misc_tasks_status: MiscTaskStatusItem[]; // parsed from JSON
  drive_folders?: DriveFolders; // parsed from JSON
  raw_assets?: RawAssetItem[]; // parsed from JSON
  raw_footage_uploaded?: boolean;
  created_at: Date;
}

export interface DbTaskInstance {
  id: string;
  content_item_id: string;
  task_name: string;
  status: TaskStatus;
  target_date_worst_case: Date | null;
  target_date_team: Date | null;
  completed_at: Date | null;
}

export interface ScriptMediaAttachment {
  id: string;
  name: string;
  data_url: string;
  created_at: string;
}

export interface ScriptComment {
  id: string;
  sr_no?: number | null; // null for general script comment; number for line-by-line comment
  author_email: string;
  category?: string;
  severity?: "minor" | "critical";
  body: string;
  is_resolved: boolean;
  created_at: string;
}

export type ScriptLifecycleStatus = "pending" | "submitted" | "revision_requested" | "done";

export interface DbScript {
  id: string;
  content_item_id: string;
  status?: ScriptLifecycleStatus;
  columns_schema: ScriptColumnSchema[]; // parsed from JSON
  rows_data: ScriptRowData[]; // parsed from JSON
  custom_notes: string | null;
  canvas_drawings: string | null;
  media_attachments: ScriptMediaAttachment[]; // parsed from JSON
  comments: ScriptComment[]; // parsed from JSON
  created_at: Date;
  updated_at?: Date;
}

export interface DbSubmission {
  id: string;
  content_item_id: string;
  task_name: string;
  version: string;
  file_url: string | null;
  file_name?: string | null;
  file_size_bytes?: number | null;
  file_type?: string | null;
  preview_url?: string | null;
  drive_file_id: string | null;
  submitted_by_role_id: string | null;
  status: SubmissionStatus;
  created_at: Date;
}

export interface DbComment {
  id: string;
  submission_id: string;
  author_email: string;
  timestamp_seconds: number | null;
  marker_x?: number | null;
  marker_y?: number | null;
  category: CommentCategory | null;
  severity: CommentSeverity;
  body: string;
  is_resolved: boolean;
  created_at: Date;
}

export interface DbIdeaBank {
  id: string;
  brand_id?: string | null;
  content_type_id: string | null;
  title: string;
  notes: string | null;
  is_assigned: boolean;
}

export interface DbCreatorSettings {
  id: string;
  default_months_open: number;
  default_id_generation_type: IdGenerationType;
  default_theme: "theme-industrial" | "theme-swiss" | "theme-comics";
  feedback_categories: string[];
  updated_at: Date;
}
