export const DB_NAME = "olho_local_library";
export const LEGACY_DB_NAME = "snaplib";

export const STORE_MEDIA = "media";
export const STORE_THUMBNAILS = "thumbnails";
export const STORE_FOLDERS = "folders";
export const STORE_TAGS = "tags";
export const STORE_SETTINGS = "settings";
export const STORE_TRASH = "trash";
export const STORE_RECORDING_DRAFTS = "recording_drafts";

export const DEFAULT_FOLDER_ID = "folder_default_eye";
export const DEFAULT_FOLDER_NAME = "In Sight";

export const SETTINGS_KEY = "app";

export const MEDIA_KINDS = Object.freeze({
  SCREENSHOT: "screenshot",
  RECORDING: "recording"
});

export const SOURCE_TYPES = Object.freeze({
  VISIBLE: "visible",
  REGION: "region",
  FULL_PAGE: "fullPage",
  ELEMENT: "element",
  SCREEN_RECORDING: "screenRecording",
  TAB_RECORDING: "tabRecording",
  WINDOW_RECORDING: "windowRecording"
});

export const DEFAULT_SETTINGS = Object.freeze({
  defaultSaveLocation: "local_library",
  askBeforeDeleting: true,
  thumbnailSize: 320,
  defaultExportFormat: "png",
  defaultAfterCaptureAction: "editor",
  skipEditorMode: "never",
  captureDelaySeconds: 0,
  autoDownload: false,
  defaultFolderId: DEFAULT_FOLDER_ID,
  defaultEditorTool: "select",
  defaultRedactionMethod: "solid",
  privacyLocalOnlyMode: true,
  storeSourceUrl: false,
  autoSave: true,
  soundToggle: false,
  shareSettings: {
    jiraUrl: "",
    githubIssueUrl: "",
    trelloCardUrl: "",
    shareSubject: "Olho Send View Report",
    shareNotes: "",
    includeSourceUrlInReport: true,
    includeBrowserInfoInReport: false
  }
});

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

export function normalizeTags(tags) {
  const input = Array.isArray(tags) ? tags : String(tags || "").split(",");
  const unique = new Map();

  input
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .forEach((entry) => {
      const lower = entry.toLowerCase();
      if (!unique.has(lower)) {
        unique.set(lower, entry);
      }
    });

  return Array.from(unique.values());
}

export function normalizeTitle(value, fallback = "Untitled") {
  const next = String(value || "").trim();
  return next || fallback;
}

export function normalizeFolderName(value) {
  const next = String(value || "").trim();
  if (!next) {
    throw new Error("Folder name is required.");
  }
  return next;
}

export function normalizeMediaKind(value) {
  if (value === MEDIA_KINDS.SCREENSHOT || value === MEDIA_KINDS.RECORDING) {
    return value;
  }
  throw new Error("Invalid media kind.");
}

export function normalizeSourceType(value, fallback) {
  const candidate = String(value || fallback || "").trim();
  const values = new Set(Object.values(SOURCE_TYPES));
  if (values.has(candidate)) {
    return candidate;
  }
  return fallback || SOURCE_TYPES.VISIBLE;
}

export function inferExtension(mimeType, fallback = "bin") {
  const type = String(mimeType || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("pdf")) return "pdf";
  if (type.includes("webm")) return "webm";
  if (type.includes("mp4")) return "mp4";
  return fallback;
}

export function safeNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function isQuotaError(error) {
  if (!error) return false;
  const name = String(error.name || "");
  const message = String(error.message || "").toLowerCase();
  if (name === "QuotaExceededError") return true;
  return message.includes("quota") || message.includes("space") || message.includes("disk");
}
