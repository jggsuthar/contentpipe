import { google } from "googleapis";
import prisma from "@/lib/prisma";
import { DriveFolders, DriveFileItem, FolderArchitectureItem } from "@/types/database";
import { Readable } from "stream";

/**
 * Google Drive Automation Service for Creator Register System
 * Matches SPEC.md Section 6.1 and Prompt 7 requirements.
 *
 * All operations execute under the Creator's offline OAuth refresh token.
 * Team members never supply their own Drive permissions.
 */

export async function getCreatorDriveClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const settings = await prisma.creatorSettings.findFirst();
  const refreshToken = settings?.drive_refresh_token;

  if (!refreshToken) {
    return null;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return google.drive({ version: "v3", auth: oauth2Client });
  } catch (err) {
    console.error("Error creating Google Drive client:", err);
    return null;
  }
}

/**
 * Checks whether the Creator has connected Google Drive and granted full Drive access scope.
 */
export async function checkCreatorDriveFullAccess(): Promise<{
  hasToken: boolean;
  hasFullScope: boolean;
  scopes?: string[];
  email?: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { hasToken: false, hasFullScope: false };
  }

  const settings = await prisma.creatorSettings.findFirst();
  const refreshToken = settings?.drive_refresh_token;
  if (!refreshToken) {
    return { hasToken: false, hasFullScope: false };
  }

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const tokenRes = await oauth2Client.getAccessToken();
    if (!tokenRes.token) {
      return { hasToken: true, hasFullScope: false };
    }
    const info = await oauth2Client.getTokenInfo(tokenRes.token);
    const scopes = info.scopes || [];
    const hasFullScope = scopes.some((s) => s === "https://www.googleapis.com/auth/drive");
    return {
      hasToken: true,
      hasFullScope,
      scopes,
      email: info.email,
    };
  } catch (err) {
    console.error("Error verifying Drive access scope:", err);
    return { hasToken: true, hasFullScope: false };
  }
}

/**
 * Permanently deletes a content project folder and all its contents from Google Drive.
 */
export async function deleteContentDriveFolder(folderId: string): Promise<boolean> {
  if (
    !folderId ||
    folderId.startsWith("drive_mock") ||
    folderId.startsWith("drive_err") ||
    folderId.startsWith("mock_")
  ) {
    return true;
  }
  const drive = await getCreatorDriveClient();
  if (!drive) return true;

  try {
    await drive.files.delete({ fileId: folderId, supportsAllDrives: true });
    return true;
  } catch (err: any) {
    if (err?.code === 404 || err?.status === 404) {
      return true;
    }
    console.error(`Failed to delete Google Drive folder ${folderId}:`, err);
    return false;
  }
}

// Global in-flight operations map to prevent concurrent race conditions
const inFlightDriveFolderOperations = new Map<string, Promise<DriveFolders>>();

/**
 * Ensures or creates the structured folder hierarchy:
 * /ContentPipe/[Brand]/[Content Series]/[ContentID - VideoTitle]/
 *   └── [Generated Default Folder Architecture...]
 *
 * (If brandName is omitted, nests directly under /ContentPipe/[ContentType]/[ContentID - VideoTitle]/)
 */
export async function ensureContentDriveFolders(
  contentTypeName: string,
  contentId: string,
  title: string,
  existingFolders?: DriveFolders | null,
  folderArchitecture?: FolderArchitectureItem[] | string[] | string | null,
  brandName?: string | null
): Promise<DriveFolders> {
  const dedupeKey = `${brandName || ""}::${contentTypeName}::${contentId || "item"}`;
  if (inFlightDriveFolderOperations.has(dedupeKey)) {
    return inFlightDriveFolderOperations.get(dedupeKey)!;
  }

  const op = (async () => {
    try {
      return await executeEnsureContentDriveFolders(
        contentTypeName,
        contentId,
        title,
        existingFolders,
        folderArchitecture,
        brandName
      );
    } finally {
      inFlightDriveFolderOperations.delete(dedupeKey);
    }
  })();

  inFlightDriveFolderOperations.set(dedupeKey, op);
  return await op;
}

async function executeEnsureContentDriveFolders(
  contentTypeName: string,
  contentId: string,
  title: string,
  existingFolders?: DriveFolders | null,
  folderArchitecture?: FolderArchitectureItem[] | string[] | string | null,
  brandName?: string | null
): Promise<DriveFolders> {
  // Normalize default folder architecture definitions
  let normalizedArch: FolderArchitectureItem[] = [];
  if (folderArchitecture) {
    if (typeof folderArchitecture === "string") {
      try {
        const parsed = JSON.parse(folderArchitecture);
        if (Array.isArray(parsed)) {
          normalizedArch = parsed.map((item: any, i: number) =>
            typeof item === "string"
              ? { id: `fld_${i}`, name: item, parent_id: null }
              : { id: item.id || `fld_${i}`, name: item.name || "Untitled", parent_id: item.parent_id || null }
          );
        }
      } catch {
        normalizedArch = [];
      }
    } else if (Array.isArray(folderArchitecture)) {
      normalizedArch = folderArchitecture.map((item: any, i: number) =>
        typeof item === "string"
          ? { id: `fld_${i}`, name: item, parent_id: null }
          : { id: item.id || `fld_${i}`, name: item.name || "Untitled", parent_id: item.parent_id || null }
      );
    }
  }

  // Filter out blank names and sanitize folder names
  normalizedArch = normalizedArch
    .filter((item) => item.name && item.name.trim().length > 0)
    .map((item) => ({
      ...item,
      name: item.name.trim().replace(/[\/\\:*?"<>|]/g, "_"),
    }));

  if (normalizedArch.length === 0) {
    normalizedArch = [{ id: "fld_raw", name: "Raw_Footage", parent_id: null }];
  }

  const hasRealMainFolder =
    existingFolders?.main_folder_id &&
    !existingFolders.main_folder_id.startsWith("drive_mock") &&
    !existingFolders.main_folder_id.startsWith("drive_err");

  const existingFolderIds: Record<string, string> = existingFolders?.folder_ids || {};
  const allFoldersProvisioned =
    hasRealMainFolder &&
    normalizedArch.length > 0 &&
    normalizedArch.every((item) => Boolean(existingFolderIds[item.id] || existingFolderIds[item.name]));

  // If already initialized with valid real Google Drive IDs and all folders exist, return existing
  if (allFoldersProvisioned) {
    return existingFolders as DriveFolders;
  }

  const drive = await getCreatorDriveClient();
  const folderTitle = `${contentId || "PROJ"} - ${title || "Untitled"}`.replace(/[\/\\:*?"<>|]/g, "_");

  // If Drive client is NOT authenticated yet, generate deterministic simulated folders
  // so the application works seamlessly in local dev & testing
  if (!drive) {
    const mockBase = `drive_mock_${contentId || "item"}`;
    const mockRecord: Record<string, string> = {};
    normalizedArch.forEach((item, idx) => {
      const mockId = `${mockBase}_${item.name.toLowerCase()}_${idx}`;
      mockRecord[item.id] = mockId;
      mockRecord[item.name] = mockId;
    });
    return {
      main_folder_id: `${mockBase}_root`,
      main_folder_url: `https://drive.google.com/drive/folders/${mockBase}_root`,
      raw_footage_id: mockRecord["fld_raw"] || `${mockBase}_raw`,
      raw_footage_url: `https://drive.google.com/drive/folders/${mockRecord["fld_raw"] || `${mockBase}_raw`}`,
      submissions_id: `${mockBase}_root`,
      submissions_url: `https://drive.google.com/drive/folders/${mockBase}_root`,
      folder_ids: mockRecord,
    };
  }

  try {
    let projectFolderId: string;
    if (hasRealMainFolder) {
      projectFolderId = existingFolders!.main_folder_id!;
    } else {
      // 1. Root Folder: "ContentPipe"
      const rootFolderId = await findOrCreateFolder(drive, "ContentPipe");

      // 2. Optional Brand Subfolder: "ContentPipe / [Brand]"
      let parentForSeriesId = rootFolderId;
      const cleanBrand = brandName?.trim();
      if (cleanBrand) {
        parentForSeriesId = await findOrCreateFolder(drive, cleanBrand, rootFolderId);
      }

      // 3. Content Series Subfolder (e.g. "Long-Form" or "Shorts")
      const typeFolderId = await findOrCreateFolder(drive, contentTypeName, parentForSeriesId);

      // 4. Project Folder: "[ContentID] - [Title]"
      projectFolderId = await findOrCreateFolder(drive, folderTitle, typeFolderId);
    }

    // Query all existing direct subfolders of projectFolderId to prevent duplicates & clean up existing
    const listChildrenRes = await drive.files.list({
      q: `'${projectFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name, createdTime)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 100,
    });

    const directChildren = (listChildrenRes.data.files || []) as Array<{ id: string; name: string }>;
    const folderByName = new Map<string, string>(); // lowerName -> canonicalFolderId
    const seenNames = new Map<string, string[]>(); // lowerName -> [id1, id2, ...]

    for (const child of directChildren) {
      if (!child.name || !child.id) continue;
      const lower = child.name.trim().toLowerCase();
      if (!seenNames.has(lower)) {
        seenNames.set(lower, []);
      }
      seenNames.get(lower)!.push(child.id);
    }

    // For any duplicate folders with the same name, keep the canonical one and clean up redundant duplicates
    for (const [lowerName, ids] of seenNames.entries()) {
      folderByName.set(lowerName, ids[0]);
      if (ids.length > 1) {
        console.warn(`Cleaning up ${ids.length - 1} duplicate folder(s) for "${lowerName}" in ${projectFolderId}`);
        for (let i = 1; i < ids.length; i++) {
          deleteContentDriveFolder(ids[i]).catch((err) =>
            console.error(`Failed to delete duplicate folder ${ids[i]}:`, err)
          );
        }
      }
    }

    // 4. Generate the exact replica of default content folder architecture inside projectFolderId
    const folderIdMap = new Map<string, string>();
    folderIdMap.set("root", projectFolderId);
    folderIdMap.set("project", projectFolderId);

    const driveFolderIdsRecord: Record<string, string> = { ...existingFolderIds };
    let rawFolderId: string | null =
      existingFolders?.raw_footage_id && !existingFolders.raw_footage_id.startsWith("drive_")
        ? existingFolders.raw_footage_id
        : null;

    // Top-level folders (parent_id is null/undefined or points to project/root) in parallel
    const topLevelItems = normalizedArch.filter(
      (item) => !item.parent_id || item.parent_id === "root" || item.parent_id === "project"
    );
    await Promise.all(
      topLevelItems.map(async (item) => {
        const lowerName = item.name.trim().toLowerCase();
        let fId =
          folderByName.get(lowerName) ||
          existingFolderIds[item.id] ||
          existingFolderIds[item.name];
        if (!fId) {
          fId = await findOrCreateFolder(drive, item.name, projectFolderId);
          folderByName.set(lowerName, fId);
        }
        folderIdMap.set(item.id, fId);
        driveFolderIdsRecord[item.id] = fId;
        driveFolderIdsRecord[item.name] = fId;
        if (
          !rawFolderId ||
          lowerName === "raw_footage" ||
          lowerName === "raw footage" ||
          item.id === "fld_raw"
        ) {
          rawFolderId = fId;
        }
      })
    );

    // Subfolders (parent_id points to another architecture folder item) in parallel
    const subItems = normalizedArch.filter(
      (item) => item.parent_id && item.parent_id !== "root" && item.parent_id !== "project"
    );
    await Promise.all(
      subItems.map(async (item) => {
        const parentDriveId = folderIdMap.get(item.parent_id!) || projectFolderId;
        let fId = existingFolderIds[item.id] || existingFolderIds[item.name];
        if (!fId) {
          fId = await findOrCreateFolder(drive, item.name, parentDriveId);
        }
        folderIdMap.set(item.id, fId);
        driveFolderIdsRecord[item.id] = fId;
        driveFolderIdsRecord[item.name] = fId;
        const lowerName = item.name.trim().toLowerCase();
        if (
          !rawFolderId &&
          (lowerName === "raw_footage" ||
            lowerName === "raw footage" ||
            item.id === "fld_raw")
        ) {
          rawFolderId = fId;
        }
      })
    );

    const finalRawId =
      rawFolderId ||
      folderByName.get("raw_footage") ||
      folderByName.get("raw footage") ||
      projectFolderId;

    return {
      main_folder_id: projectFolderId,
      main_folder_url: `https://drive.google.com/drive/folders/${projectFolderId}`,
      raw_footage_id: finalRawId,
      raw_footage_url: `https://drive.google.com/drive/folders/${finalRawId}`,
      submissions_id: projectFolderId,
      submissions_url: `https://drive.google.com/drive/folders/${projectFolderId}`,
      folder_ids: driveFolderIdsRecord,
    };
  } catch (error) {
    console.error("Error creating Google Drive folders:", error);
    folderPathCache.clear();
    // Fallback to mock structure if Google API quotas fail
    const mockBase = `drive_err_${contentId || "item"}`;
    return {
      main_folder_id: `${mockBase}_root`,
      main_folder_url: `https://drive.google.com/drive/folders/${mockBase}_root`,
      raw_footage_id: `${mockBase}_raw`,
      raw_footage_url: `https://drive.google.com/drive/folders/${mockBase}_raw`,
      submissions_id: `${mockBase}_root`,
      submissions_url: `https://drive.google.com/drive/folders/${mockBase}_root`,
    };
  }
}

const folderPathCache = new Map<string, string>();

/**
 * Finds or creates a single Google Drive folder by name and parent ID.
 */
async function findOrCreateFolder(
  drive: any,
  folderName: string,
  parentId?: string
): Promise<string> {
  const cacheKey = `${parentId || "root"}::${folderName.trim().toLowerCase()}`;
  const cachedId = folderPathCache.get(cacheKey);
  if (cachedId) {
    return cachedId;
  }

  let query = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const list = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (list.data.files && list.data.files.length > 0) {
    const existingId = list.data.files[0].id!;
    folderPathCache.set(cacheKey, existingId);
    return existingId;
  }

  const fileMetadata: any = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) {
    fileMetadata.parents = [parentId];
  }

  const folder = await drive.files.create({
    requestBody: fileMetadata,
    fields: "id",
    supportsAllDrives: true,
  });

  const newId = folder.data.id!;
  folderPathCache.set(cacheKey, newId);
  return newId;
}

/**
 * Calculates direct download links:
 * - Files <= 100 MB: https://drive.google.com/uc?export=download&id=FILE_ID
 * - Files > 100 MB: https://drive.usercontent.google.com/download?id=FILE_ID&export=download&confirm=t
 *   (Bypasses Google's "can't scan for viruses" warning for seamless downloads).
 */
export function getDriveDownloadUrl(fileId: string, sizeBytes?: number): string {
  const isLarge = Boolean(sizeBytes && sizeBytes > 100 * 1024 * 1024);
  if (isLarge) {
    return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
  }
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Lists all contents (files and subfolders) inside a given Google Drive folder.
 * Folders are strictly sorted first, followed by files alphabetically.
 */
export async function listDriveFolderContents(
  folderId: string
): Promise<{ files: DriveFileItem[]; folderName?: string }> {
  const drive = await getCreatorDriveClient();

  if (!drive || folderId.startsWith("drive_mock") || folderId.startsWith("drive_err")) {
    return { files: [], folderName: "Content_Folder" };
  }

  try {
    let folderName = "";
    try {
      const meta = await drive.files.get({
        fileId: folderId,
        supportsAllDrives: true,
        fields: "id, name",
      });
      folderName = meta.data.name || "";
    } catch {
      // folder meta may fail if root or permission
    }

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: "files(id, name, mimeType, size, webViewLink, createdTime, thumbnailLink)",
      pageSize: 1000,
      spaces: "drive",
    });

    const files: DriveFileItem[] = (res.data.files || []).map((f) => {
      const isFolder = f.mimeType === "application/vnd.google-apps.folder";
      const sizeBytes = f.size ? parseInt(f.size, 10) : undefined;
      return {
        id: f.id!,
        name: f.name || "Untitled",
        mimeType: f.mimeType || "",
        isFolder,
        sizeBytes,
        webViewLink: f.webViewLink || (isFolder ? `https://drive.google.com/drive/folders/${f.id}` : `https://drive.google.com/file/d/${f.id}/view`),
        directDownloadUrl: isFolder ? undefined : getDriveDownloadUrl(f.id!, sizeBytes),
        createdTime: f.createdTime,
        thumbnailLink: f.thumbnailLink,
      };
    });

    // Deduplicate any subfolders with identical names, keeping canonical and cleaning up duplicate in Drive
    const deduplicatedFiles: DriveFileItem[] = [];
    const seenFolderNames = new Set<string>();

    for (const item of files) {
      if (item.isFolder) {
        const lower = item.name.trim().toLowerCase();
        if (seenFolderNames.has(lower)) {
          deleteContentDriveFolder(item.id).catch((err) =>
            console.error(`Failed to delete duplicate folder ${item.id}:`, err)
          );
          continue;
        }
        seenFolderNames.add(lower);
      }
      deduplicatedFiles.push(item);
    }

    // Strictly sort folders first, then files alphabetically (A-Z)
    deduplicatedFiles.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });

    return { files: deduplicatedFiles, folderName };
  } catch (err) {
    console.error(`Failed to list contents for Drive folder ${folderId}:`, err);
    return { files: [] };
  }
}

/**
 * Creates a subfolder inside the specified parent Google Drive folder.
 */
export async function createDriveSubfolder(
  name: string,
  parentId: string
): Promise<DriveFileItem> {
  const drive = await getCreatorDriveClient();

  if (!drive || parentId.startsWith("drive_mock") || parentId.startsWith("drive_err")) {
    const mockId = `mock_subfolder_${Date.now()}`;
    return {
      id: mockId,
      name,
      mimeType: "application/vnd.google-apps.folder",
      isFolder: true,
      webViewLink: `https://drive.google.com/drive/folders/${mockId}`,
      createdTime: new Date().toISOString(),
    };
  }

  const res = await drive.files.create({
    requestBody: {
      name: name.trim(),
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    supportsAllDrives: true,
    fields: "id, name, mimeType, webViewLink, createdTime",
  });

  return {
    id: res.data.id!,
    name: res.data.name || name,
    mimeType: "application/vnd.google-apps.folder",
    isFolder: true,
    webViewLink: res.data.webViewLink || `https://drive.google.com/drive/folders/${res.data.id}`,
    createdTime: res.data.createdTime,
  };
}

/**
 * Uploads a buffer to a specific Google Drive folder.
 */
export async function uploadBufferToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<{ fileId: string; viewUrl: string; sizeBytes: number; directDownloadUrl: string }> {
  const drive = await getCreatorDriveClient();

  if (!drive || folderId.startsWith("drive_mock") || folderId.startsWith("drive_err")) {
    const mockId = `mock_file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    return {
      fileId: mockId,
      viewUrl: `https://drive.google.com/file/d/${mockId}/view`,
      sizeBytes: buffer.length,
      directDownloadUrl: getDriveDownloadUrl(mockId, buffer.length),
    };
  }

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: mimeType || "application/octet-stream",
      body: stream,
    },
    supportsAllDrives: true,
    fields: "id, webViewLink, size",
  });

  const fileId = res.data.id!;
  const sizeBytes = res.data.size ? parseInt(res.data.size, 10) : buffer.length;

  return {
    fileId,
    viewUrl: res.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
    sizeBytes,
    directDownloadUrl: getDriveDownloadUrl(fileId, sizeBytes),
  };
}

/**
 * Deletes a file permanently from Google Drive.
 */
export async function deleteDriveFile(fileId: string): Promise<boolean> {
  const drive = await getCreatorDriveClient();
  if (!drive || fileId.startsWith("mock_")) {
    return true;
  }

  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
    return true;
  } catch (err) {
    console.error(`Failed to delete Google Drive file ${fileId}:`, err);
    return false;
  }
}

/**
 * Copies a file to another folder in Google Drive (e.g. into 04_Final_Exports on approval).
 */
export async function copyFileToFolder(
  fileId: string,
  targetFolderId: string,
  newTitle?: string
): Promise<{ newFileId: string; viewUrl: string }> {
  const drive = await getCreatorDriveClient();
  if (!drive || fileId.startsWith("mock_")) {
    const mockId = `mock_final_${Date.now()}`;
    return {
      newFileId: mockId,
      viewUrl: `https://drive.google.com/file/d/${mockId}/view`,
    };
  }

  const res = await drive.files.copy({
    fileId,
    requestBody: {
      name: newTitle,
      parents: [targetFolderId],
    },
    fields: "id, webViewLink",
  });

  return {
    newFileId: res.data.id!,
    viewUrl: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
  };
}
