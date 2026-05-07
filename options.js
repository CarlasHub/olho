import {
  clearAllData,
  emptyTrash,
  estimateStoragePressure,
  getAppSettings,
  getStorageUsage,
  permanentlyDeleteLargest,
  updateAppSettings
} from "./src/storage/storage.js";
import { installRuntimeGuard } from "./src/shared/runtime-guard.js";

const form = document.getElementById("optionsForm");
const status = document.getElementById("status");
const defaultSaveLocation = document.getElementById("defaultSaveLocation");
const defaultAfterCaptureAction = document.getElementById("defaultAfterCaptureAction");
const skipEditorMode = document.getElementById("skipEditorMode");
const askBeforeDeleting = document.getElementById("askBeforeDeleting");
const captureDelaySeconds = document.getElementById("captureDelaySeconds");
const thumbnailSize = document.getElementById("thumbnailSize");
const defaultExportFormat = document.getElementById("defaultExportFormat");
const autoDownload = document.getElementById("autoDownload");
const privacyLocalOnlyMode = document.getElementById("privacyLocalOnlyMode");
const storeSourceUrl = document.getElementById("storeSourceUrl");
const autoSave = document.getElementById("autoSave");
const soundToggle = document.getElementById("soundToggle");

const storageStats = document.getElementById("storageStats");
const pressureSummary = document.getElementById("pressureSummary");
const refreshUsageBtn = document.getElementById("refreshUsageBtn");
const emptyTrashBtn = document.getElementById("emptyTrashBtn");
const deleteLargeBtn = document.getElementById("deleteLargeBtn");
const deleteAllBtn = document.getElementById("deleteAllBtn");
const settingsNavButtons = Array.from(document.querySelectorAll(".settings-nav-btn[data-settings-target]"));
const settingsGroups = Array.from(document.querySelectorAll(".settings-group"));
const settingsPanels = Array.from(document.querySelectorAll("[data-settings-section]"));

function showStatus(message, isError = false) {
  status.textContent = message;
  status.style.color = isError ? "#ffd4dc" : "#b4c8ea";
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => {
    status.textContent = "";
  }, 2600);
}

installRuntimeGuard({
  onError(message) {
    showStatus(`Unexpected error: ${message}`, true);
  }
});

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function renderUsage(usage) {
  const tiles = [
    { label: "Total Items", value: String(usage.itemCount || 0) },
    { label: "Images", value: String(usage.imageCount || 0) },
    { label: "Videos", value: String(usage.videoCount || 0) },
    { label: "Trash", value: String(usage.trashCount || 0) },
    { label: "Media Size", value: formatBytes(usage.mediaBytes || 0) },
    { label: "Thumb Size", value: formatBytes(usage.thumbnailBytes || 0) },
    { label: "Total Size", value: formatBytes(usage.totalBytes || 0) }
  ];

  storageStats.innerHTML = "";
  tiles.forEach((tile) => {
    const box = document.createElement("div");
    box.className = "stat";
    box.innerHTML = `<div class="stat-label">${tile.label}</div><div class="stat-value">${tile.value}</div>`;
    storageStats.append(box);
  });
}

function renderPressure(pressure) {
  if (!pressureSummary) return;

  const ratio = pressure.usageRatio;
  const percentage = ratio === null ? "unknown" : `${(ratio * 100).toFixed(1)}%`;
  const quotaText = pressure.quotaBytes ? formatBytes(pressure.quotaBytes) : "unknown";

  pressureSummary.textContent = `Storage pressure: ${percentage} of browser quota (${formatBytes(pressure.projectedBytes)} projected / ${quotaText}).`;

  if (pressure.overQuotaLikely) {
    pressureSummary.style.color = "#fecaca";
  } else if (pressure.nearQuota) {
    pressureSummary.style.color = "#fde68a";
  } else {
    pressureSummary.style.color = "#c6d2ea";
  }
}

async function refreshUsage() {
  try {
    const [usage, pressure] = await Promise.all([getStorageUsage(), estimateStoragePressure(0)]);
    renderUsage(usage);
    renderPressure(pressure);
  } catch (error) {
    console.error(error);
    showStatus("Failed to load storage usage.", true);
  }
}

async function loadOptions() {
  try {
    const settings = await getAppSettings();

    defaultSaveLocation.value = "local_library";
    defaultAfterCaptureAction.value = String(settings.defaultAfterCaptureAction || "editor");
    skipEditorMode.value = String(settings.skipEditorMode || "never");
    askBeforeDeleting.checked = settings.askBeforeDeleting !== false;
    captureDelaySeconds.value = String(Number(settings.captureDelaySeconds || 0));
    thumbnailSize.value = String(settings.thumbnailSize || 320);
    defaultExportFormat.value = String(settings.defaultExportFormat || "png");
    autoDownload.checked = Boolean(settings.autoDownload);
    privacyLocalOnlyMode.checked = true;
    storeSourceUrl.checked = Boolean(settings.storeSourceUrl);
    autoSave.checked = settings.autoSave !== false;
    soundToggle.checked = Boolean(settings.soundToggle);
  } catch (error) {
    console.error(error);
    showStatus("Failed to load preferences.", true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await updateAppSettings({
      defaultSaveLocation: "local_library",
      defaultAfterCaptureAction: String(defaultAfterCaptureAction.value || "editor"),
      skipEditorMode: String(skipEditorMode.value || "never"),
      askBeforeDeleting: askBeforeDeleting.checked,
      captureDelaySeconds: Math.max(0, Number(captureDelaySeconds.value || 0)),
      thumbnailSize: Number(thumbnailSize.value) || 320,
      defaultExportFormat: String(defaultExportFormat.value || "png"),
      autoDownload: autoDownload.checked,
      privacyLocalOnlyMode: true,
      storeSourceUrl: storeSourceUrl.checked,
      autoSave: autoSave.checked,
      soundToggle: soundToggle.checked
    });
    showStatus("Preferences saved.");
  } catch (error) {
    console.error(error);
    showStatus("Save failed.", true);
  }
});

refreshUsageBtn?.addEventListener("click", refreshUsage);

emptyTrashBtn?.addEventListener("click", async () => {
  if (!confirm("Delete all items currently in trash permanently?")) {
    return;
  }

  try {
    const result = await emptyTrash();
    await refreshUsage();
    showStatus(`Trash emptied (${result.removed} item(s)).`);
  } catch (error) {
    console.error(error);
    showStatus("Empty trash failed.", true);
  }
});

deleteLargeBtn?.addEventListener("click", async () => {
  if (!confirm("Delete the 10 largest items permanently? This cannot be undone.")) {
    return;
  }

  try {
    const result = await permanentlyDeleteLargest(10);
    await refreshUsage();
    showStatus(`Deleted ${result.removed} large item(s).`);
  } catch (error) {
    console.error(error);
    showStatus("Delete largest failed.", true);
  }
});

deleteAllBtn?.addEventListener("click", async () => {
  const confirmText = prompt("Type DELETE to remove all local Olho data.");
  if (confirmText !== "DELETE") {
    showStatus("Delete canceled.");
    return;
  }

  try {
    await clearAllData();
    await refreshUsage();
    await loadOptions();
    showStatus("All local data deleted.");
  } catch (error) {
    console.error(error);
    showStatus("Delete failed.", true);
  }
});

function activateSettingsSection(targetId, scroll = false) {
  const normalizedId = String(targetId || "").trim();
  if (!normalizedId) return;

  settingsNavButtons.forEach((entry) => {
    const isActive = String(entry.dataset.settingsTarget || "").trim() === normalizedId;
    entry.classList.toggle("active", isActive);
    entry.setAttribute("aria-current", isActive ? "true" : "false");
  });

  settingsPanels.forEach((panel) => {
    const panelId = String(panel.dataset.settingsSection || "").trim();
    const isMatch = panelId === normalizedId;
    panel.hidden = !isMatch;
    if (panel instanceof HTMLDetailsElement) {
      panel.open = isMatch;
    }
  });

  if (scroll) {
    const target = settingsPanels.find((panel) => String(panel.dataset.settingsSection || "").trim() === normalizedId);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

settingsNavButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = String(button.dataset.settingsTarget || "").trim();
    if (!targetId) return;
    activateSettingsSection(targetId, true);
  });
});

activateSettingsSection("generalSettings", false);

loadOptions();
refreshUsage();
