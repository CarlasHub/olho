import {
  getAppSettings,
  getMediaBlob,
  getThumbnailBlob,
  listFolders,
  listItems,
  updateMediaMetadata,
  updateAppSettings
} from "./src/storage/storage.js";
import { installRuntimeGuard } from "./src/shared/runtime-guard.js";

const filterSummary = document.getElementById("filterSummary");
const stats = document.getElementById("stats");
const itemsContainer = document.getElementById("itemsContainer");
const status = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");

const includeSourceUrlInReport = document.getElementById("includeSourceUrlInReport");
const includeBrowserInfoInReport = document.getElementById("includeBrowserInfoInReport");

const copySummaryBtn = document.getElementById("copySummaryBtn");
const copyHtmlBtn = document.getElementById("copyHtmlBtn");
const copyImageBtn = document.getElementById("copyImageBtn");
const downloadMarkdownBtn = document.getElementById("downloadMarkdownBtn");
const downloadTextBtn = document.getElementById("downloadTextBtn");
const downloadHtmlBtn = document.getElementById("downloadHtmlBtn");
const downloadHtmlSummaryBtn = document.getElementById("downloadHtmlSummaryBtn");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const downloadPngBtn = document.getElementById("downloadPngBtn");
const downloadJpgBtn = document.getElementById("downloadJpgBtn");
const downloadWebpBtn = document.getElementById("downloadWebpBtn");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
const downloadZipBtn = document.getElementById("downloadZipBtn");
const printBtn = document.getElementById("printBtn");

const jiraUrl = document.getElementById("jiraUrl");
const githubIssueUrl = document.getElementById("githubIssueUrl");
const trelloCardUrl = document.getElementById("trelloCardUrl");
const shareSubject = document.getElementById("shareSubject");
const shareNotes = document.getElementById("shareNotes");
const openJiraBtn = document.getElementById("openJiraBtn");
const openGithubBtn = document.getElementById("openGithubBtn");
const openTrelloBtn = document.getElementById("openTrelloBtn");
const openMailBtn = document.getElementById("openMailBtn");

const state = {
  filters: parseFilters(),
  folders: [],
  items: [],
  filteredItems: [],
  appSettings: null,
  excludedItemIds: new Set()
};

const encoder = new TextEncoder();
const crcTable = buildCrcTable();

setup().catch((error) => {
  console.error(error);
  setStatus("Failed to load Send View.", true);
});

async function setup() {
  await loadSettingsIntoForm();
  bindEvents();
  await refresh();
}

function bindEvents() {
  refreshBtn?.addEventListener("click", refresh);
  copySummaryBtn?.addEventListener("click", copySummary);
  copyHtmlBtn?.addEventListener("click", copyHtmlSnippet);
  copyImageBtn?.addEventListener("click", copyPrimaryImageFromSelection);
  downloadMarkdownBtn?.addEventListener("click", downloadMarkdown);
  downloadTextBtn?.addEventListener("click", downloadTextSummary);
  downloadHtmlBtn?.addEventListener("click", downloadHtmlReport);
  downloadHtmlSummaryBtn?.addEventListener("click", downloadHtmlSummary);
  downloadPdfBtn?.addEventListener("click", downloadPdfReport);
  downloadPngBtn?.addEventListener("click", () => downloadPrimaryImageAs("png"));
  downloadJpgBtn?.addEventListener("click", () => downloadPrimaryImageAs("jpg"));
  downloadWebpBtn?.addEventListener("click", () => downloadPrimaryImageAs("webp"));
  downloadJsonBtn?.addEventListener("click", downloadJsonMetadata);
  downloadZipBtn?.addEventListener("click", downloadZipBundle);
  printBtn?.addEventListener("click", printSelection);

  [jiraUrl, githubIssueUrl, trelloCardUrl, shareSubject, shareNotes].forEach((field) => {
    field?.addEventListener("change", saveShareSettings);
  });

  [includeSourceUrlInReport, includeBrowserInfoInReport].forEach((field) => {
    field?.addEventListener("change", async () => {
      await saveShareSettings();
      renderItems();
    });
  });

  openJiraBtn?.addEventListener("click", openJiraDraft);
  openGithubBtn?.addEventListener("click", openGithubDraft);
  openTrelloBtn?.addEventListener("click", openTrelloDraft);
  openMailBtn?.addEventListener("click", openMailDraft);
}

async function loadSettingsIntoForm() {
  const appSettings = await getAppSettings();
  state.appSettings = appSettings;

  const settings = appSettings.shareSettings || {};
  jiraUrl.value = sanitizeText(settings.jiraUrl || "");
  githubIssueUrl.value = sanitizeText(settings.githubIssueUrl || "");
  trelloCardUrl.value = sanitizeText(settings.trelloCardUrl || "");
  shareSubject.value = sanitizeText(settings.shareSubject || "Olho Send View Report");
  shareNotes.value = sanitizeText(settings.shareNotes || "");

  includeSourceUrlInReport.checked = settings.includeSourceUrlInReport !== false;
  includeBrowserInfoInReport.checked = Boolean(settings.includeBrowserInfoInReport);
}

async function saveShareSettings() {
  const latest = await getAppSettings();
  const existing = latest.shareSettings || {};
  const next = {
    ...existing,
    jiraUrl: sanitizeText(jiraUrl.value),
    githubIssueUrl: sanitizeText(githubIssueUrl.value),
    trelloCardUrl: sanitizeText(trelloCardUrl.value),
    shareSubject: sanitizeText(shareSubject.value || "Olho Send View Report"),
    shareNotes: sanitizeText(shareNotes.value),
    includeSourceUrlInReport: includeSourceUrlInReport.checked,
    includeBrowserInfoInReport: includeBrowserInfoInReport.checked
  };

  const saved = await updateAppSettings({ shareSettings: next });
  state.appSettings = saved;
}

function parseFilters() {
  const params = new URLSearchParams(window.location.search);
  return {
    folderId: params.get("folderId") || "",
    query: (params.get("query") || "").trim().toLowerCase(),
    tag: (params.get("tag") || "").trim(),
    sort: params.get("sort") || "newest"
  };
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function extensionFromItem(item) {
  const mime = String(item.metadata?.mimeType || "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("gif")) return "gif";
  return item.type === "video" ? "webm" : "png";
}

function itemTitle(item) {
  return sanitizeText(item.metadata?.title || `Untitled ${item.type}`) || `Untitled ${item.type}`;
}

function itemTags(item) {
  return Array.isArray(item.metadata?.tags) ? item.metadata.tags.map((tag) => sanitizeText(tag)).filter(Boolean) : [];
}

function safeFilename(value) {
  return sanitizeText(value)
    .replace(/[^a-z0-9-_ ]+/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";
}

function folderNameById(folderId) {
  const folder = state.folders.find((entry) => entry.id === folderId);
  return folder?.name || "In Sight";
}

function filterItems(items) {
  let filtered = [...items].filter((item) => !state.excludedItemIds.has(item.id));

  if (state.filters.folderId) {
    filtered = filtered.filter((item) => item.folderId === state.filters.folderId);
  }

  if (state.filters.query) {
    filtered = filtered.filter((item) => itemTitle(item).toLowerCase().includes(state.filters.query));
  }

  if (state.filters.tag) {
    filtered = filtered.filter((item) => itemTags(item).includes(state.filters.tag));
  }

  filtered.sort((a, b) => {
    if (state.filters.sort === "oldest") {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }
    if (state.filters.sort === "title") {
      return itemTitle(a).localeCompare(itemTitle(b));
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return filtered;
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.style.borderColor = isError ? "rgba(248, 113, 113, 0.8)" : "rgba(108, 184, 255, 0.6)";
  status.style.color = isError ? "#fecaca" : "#dbeafe";
}

installRuntimeGuard({
  onError(message) {
    setStatus(`Unexpected error: ${message}`, true);
  }
});

function renderStats() {
  const totalBytes = state.filteredItems.reduce((sum, item) => sum + Number(item.metadata?.sizeBytes || 0), 0);
  const imageCount = state.filteredItems.filter((item) => item.type === "image").length;
  const videoCount = state.filteredItems.filter((item) => item.type === "video").length;

  const tiles = [
    { label: "Items", value: String(state.filteredItems.length) },
    { label: "Screenshots", value: String(imageCount) },
    { label: "Recordings", value: String(videoCount) },
    { label: "Total Size", value: formatBytes(totalBytes) }
  ];

  stats.innerHTML = "";
  tiles.forEach((tile) => {
    const box = document.createElement("div");
    box.className = "stat";
    box.innerHTML = `<div class="label">${escapeHtml(tile.label)}</div><div class="value">${escapeHtml(tile.value)}</div>`;
    stats.append(box);
  });
}

function renderFilterSummary() {
  const parts = [];
  if (state.filters.folderId) {
    parts.push(`Folder: ${folderNameById(state.filters.folderId)}`);
  }
  if (state.filters.query) {
    parts.push(`Query: ${state.filters.query}`);
  }
  if (state.filters.tag) {
    parts.push(`Tag: ${state.filters.tag}`);
  }
  parts.push(`Sort: ${state.filters.sort}`);
  filterSummary.textContent = parts.join(" | ");
}

function sanitizeUrlLike(value) {
  const text = sanitizeText(value);
  if (!text) return "";
  if (/^(chrome|about|edge|devtools):\/\//i.test(text)) return "";
  return text;
}

function getBrowserInfo() {
  if (typeof navigator === "undefined") return "";
  const ua = sanitizeText(navigator.userAgent || "");
  const platform = sanitizeText(navigator.platform || "");
  return [ua, platform].filter(Boolean).join(" | ");
}

function inferAnnotationSummary(metadata = {}) {
  if (sanitizeText(metadata.annotationSummary)) {
    return sanitizeText(metadata.annotationSummary);
  }

  const project = metadata.olhoProject;
  if (!project || !Array.isArray(project.actions) || !project.actions.length) {
    return "";
  }

  const counts = new Map();
  project.actions.forEach((action) => {
    const type = sanitizeText(action?.type || "annotation");
    if (!type) return;
    counts.set(type, (counts.get(type) || 0) + 1);
  });

  if (!counts.size) return "";
  return [...counts.entries()]
    .map(([type, count]) => `${type}: ${count}`)
    .join(", ");
}

function reportEntryFromItem(item) {
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const includeSourceUrl = includeSourceUrlInReport.checked;
  const includeBrowserInfo = includeBrowserInfoInReport.checked;

  const sourcePageTitle = sanitizeText(
    metadata.sourcePageTitle ||
      metadata.pageTitle ||
      metadata.capturePageTitle ||
      ""
  );

  const sourceUrl = sanitizeUrlLike(
    metadata.sourceUrl ||
      metadata.pageUrl ||
      metadata.capturePageUrl ||
      ""
  );

  const captureType = sanitizeText(metadata.sourceType || item.type || "capture");
  const title = itemTitle(item);
  const extension = extensionFromItem(item);
  const filename = `${safeFilename(title)}.${extension}`;
  const noteText = sanitizeText(metadata.notes || metadata.note || "");
  const annotations = inferAnnotationSummary(metadata);
  const tags = itemTags(item);

  return {
    id: item.id,
    title,
    captureDate: new Date(item.createdAt).toISOString(),
    captureType,
    sourcePageTitle: sourcePageTitle || "",
    sourceUrlRaw: sourceUrl,
    sourceUrl: includeSourceUrl ? sourceUrl : "",
    sourceUrlStored: Boolean(sourceUrl),
    filename,
    notes: noteText,
    tags,
    browserInfo: includeBrowserInfo ? getBrowserInfo() : "",
    annotationSummary: annotations,
    kind: item.type,
    folderName: folderNameById(item.folderId),
    mimeType: sanitizeText(metadata.mimeType || ""),
    sizeBytes: Number(metadata.sizeBytes || 0),
    durationMs: Number(metadata.durationMs || 0),
    privacyNote:
      "Generated locally by Olho. No upload, no hosted links, and no remote processing."
  };
}

function buildReportEntries() {
  return state.filteredItems.map(reportEntryFromItem);
}

function summaryBodyText(entries) {
  const notes = sanitizeText(shareNotes.value || "");
  const lines = [];

  lines.push("Olho Send View Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Items: ${entries.length}`);
  lines.push(`Screenshots: ${entries.filter((entry) => entry.kind === "image").length}`);
  lines.push(`Recordings: ${entries.filter((entry) => entry.kind === "video").length}`);
  lines.push("");
  lines.push("Attach files manually.");
  if (notes) {
    lines.push(`Notes: ${notes}`);
  }
  lines.push("");

  entries.forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.title}`);
    lines.push(`   Capture date: ${entry.captureDate}`);
    lines.push(`   Capture type: ${entry.captureType}`);
    lines.push(`   Source page title: ${entry.sourcePageTitle || "(not available)"}`);
    if (includeSourceUrlInReport.checked) {
      if (entry.sourceUrl) {
        lines.push(`   Source URL: ${entry.sourceUrl}`);
      } else if (entry.sourceUrlStored) {
        lines.push("   Source URL: (stored but filtered)");
      } else {
        lines.push("   Source URL: (not stored)");
      }
    } else {
      lines.push("   Source URL: (excluded from report)");
    }
    lines.push(`   Filename: ${entry.filename}`);
    lines.push(`   Tags: ${entry.tags.length ? entry.tags.join(", ") : "(none)"}`);
    lines.push(`   Notes: ${entry.notes || "(none)"}`);
    lines.push(`   Annotation summary: ${entry.annotationSummary || "(none)"}`);
    if (includeBrowserInfoInReport.checked) {
      lines.push(`   Browser info: ${entry.browserInfo || "(not available)"}`);
    }
    lines.push(`   Privacy note: ${entry.privacyNote}`);
    lines.push("");
  });

  return lines.join("\n");
}

function markdownSummary(entries) {
  const notes = sanitizeText(shareNotes.value || "");
  const lines = [];
  lines.push("# Olho Send View Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`- Items: ${entries.length}`);
  lines.push(`- Screenshots: ${entries.filter((entry) => entry.kind === "image").length}`);
  lines.push(`- Recordings: ${entries.filter((entry) => entry.kind === "video").length}`);
  lines.push("- Attach files manually.");
  if (notes) {
    lines.push(`- Notes: ${notes}`);
  }
  lines.push("");
  lines.push("## Entries");
  lines.push("");

  entries.forEach((entry, index) => {
    lines.push(`### ${index + 1}. ${entry.title}`);
    lines.push(`- Capture date: ${entry.captureDate}`);
    lines.push(`- Capture type: ${entry.captureType}`);
    lines.push(`- Source page title: ${entry.sourcePageTitle || "(not available)"}`);
    lines.push(`- Source URL: ${entry.sourceUrl || "(not stored or excluded)"}`);
    lines.push(`- Filename: ${entry.filename}`);
    lines.push(`- Notes: ${entry.notes || "(none)"}`);
    lines.push(`- Tags: ${entry.tags.length ? entry.tags.join(", ") : "(none)"}`);
    lines.push(`- Browser info: ${entry.browserInfo || "(excluded)"}`);
    lines.push(`- Annotation summary: ${entry.annotationSummary || "(none)"}`);
    lines.push(`- Privacy note: ${entry.privacyNote}`);
    lines.push("");
  });

  return lines.join("\n");
}

function htmlSummaryFragment(entries) {
  const rows = entries
    .map((entry) => {
      return `<tr>
        <td>${escapeHtml(entry.title)}</td>
        <td>${escapeHtml(entry.captureDate)}</td>
        <td>${escapeHtml(entry.captureType)}</td>
        <td>${escapeHtml(entry.sourcePageTitle || "-")}</td>
        <td>${escapeHtml(entry.sourceUrl || "-")}</td>
        <td>${escapeHtml(entry.filename)}</td>
        <td>${escapeHtml(entry.notes || "-")}</td>
        <td>${escapeHtml(entry.tags.join(", ") || "-")}</td>
        <td>${escapeHtml(entry.browserInfo || "-")}</td>
        <td>${escapeHtml(entry.annotationSummary || "-")}</td>
      </tr>`;
    })
    .join("");

  return `<section>
    <h2>Olho Send View Report</h2>
    <p>Generated: ${escapeHtml(new Date().toISOString())}</p>
    <p>Attach files manually. Generated locally by Olho.</p>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr>
          <th>Title</th>
          <th>Capture Date</th>
          <th>Capture Type</th>
          <th>Source Page Title</th>
          <th>Source URL</th>
          <th>Filename</th>
          <th>Notes</th>
          <th>Tags</th>
          <th>Browser Info</th>
          <th>Annotation Summary</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function fullReportDocument(entries) {
  const notes = sanitizeText(shareNotes.value || "");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Olho Send View Report</title>
    <style>
      body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #111827; }
      h1, h2 { margin-bottom: 8px; }
      p { margin: 4px 0; }
      table { border-collapse: collapse; width: 100%; margin-top: 12px; }
      th, td { border: 1px solid #d1d5db; text-align: left; padding: 8px; vertical-align: top; }
      th { background: #eef2ff; }
      code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>Olho Send View Report</h1>
    <p><strong>Generated:</strong> ${escapeHtml(new Date().toISOString())}</p>
    <p><strong>Items:</strong> ${entries.length}</p>
    <p><strong>Filters:</strong> ${escapeHtml(filterSummary.textContent || "none")}</p>
    <p><strong>Local privacy note:</strong> Generated locally by Olho. No upload, no hosted links, and no remote processing.</p>
    <p><strong>Manual sharing:</strong> Attach files manually.</p>
    ${notes ? `<h2>Notes</h2><p>${escapeHtml(notes)}</p>` : ""}
    ${htmlSummaryFragment(entries)}
  </body>
</html>`;
}

function reportJson(entries) {
  return {
    title: "Olho Send View Report",
    generatedAt: new Date().toISOString(),
    filterSummary: filterSummary.textContent || "",
    notes: sanitizeText(shareNotes.value || ""),
    includeSourceUrlInReport: includeSourceUrlInReport.checked,
    includeBrowserInfoInReport: includeBrowserInfoInReport.checked,
    privacy:
      "Generated locally by Olho. No upload, no hosted links, and no remote processing.",
    attachFilesManually: true,
    count: entries.length,
    items: entries
  };
}

function shareBody(entries) {
  const text = summaryBodyText(entries);
  return `${text}\n\nAttach files manually.`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  return chrome.downloads
    .download({
      url,
      filename,
      saveAs: true
    })
    .finally(() => {
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });
}

function cleanBaseUrl(url) {
  return sanitizeText(url).replace(/\/+$/, "");
}

function ensureHttpUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function buildIssueSubject() {
  return sanitizeText(shareSubject.value || "Olho Send View Report");
}

function createCopyFilename(item) {
  return `Olho/${safeFilename(itemTitle(item))}-${Date.now()}.${extensionFromItem(item)}`;
}

async function openEditorAndCopy(item, options = { copyAfterOpen: true }) {
  if (!item?.id) {
    setStatus("This item cannot be opened in editor copy mode.", true);
    return;
  }
  const query = options.copyAfterOpen ? "&copy=1" : "";
  const url = chrome.runtime.getURL(`editor.html?itemId=${encodeURIComponent(item.id)}${query}`);
  await chrome.tabs.create({ url });
  setStatus(options.copyAfterOpen ? "Editor opened for copy action." : "Editor opened.");
}

function normalizeUserUrlInput(value) {
  const raw = sanitizeText(value);
  if (!raw) return "";
  if (/^(chrome|about|edge|devtools):\/\//i.test(raw)) {
    return "";
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  return `https://${raw}`;
}

async function promptAndSetSourceUrl(item) {
  const current = sanitizeUrlLike(item?.metadata?.sourceUrl || item?.metadata?.pageUrl || "");
  const nextInput = window.prompt(
    "Set source URL for this capture. Leave blank to clear it.",
    current
  );
  if (nextInput === null) return;

  const next = normalizeUserUrlInput(nextInput);
  try {
    await updateMediaMetadata(item.id, {
      metadata: {
        sourceUrl: next
      }
    });
    setStatus(next ? "Source URL saved for this item." : "Source URL cleared for this item.");
    await refresh();
  } catch (error) {
    console.error(error);
    setStatus("Could not update source URL.", true);
  }
}

async function downloadItemFile(item) {
  const blob = await getMediaBlob(item.id);
  if (!(blob instanceof Blob)) {
    setStatus("Source file is unavailable for this item.", true);
    return;
  }

  await downloadBlob(blob, createCopyFilename(item));
  setStatus("File download started.");
}

function primaryImageItem() {
  return (
    state.filteredItems.find((item) => item.type === "image") ||
    state.items.find((item) => item.type === "image") ||
    null
  );
}

async function convertImageBlobFormat(blob, format) {
  if (!(blob instanceof Blob)) {
    throw new Error("Image source is unavailable.");
  }

  if (format === "png") {
    if (blob.type === "image/png") return blob;
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    throw new Error("Canvas is unavailable for image conversion.");
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  if (format === "png") {
    return canvasToBlob(canvas, "image/png");
  }
  if (format === "jpg") {
    return canvasToBlob(canvas, "image/jpeg", 0.92);
  }
  if (format === "webp") {
    return canvasToBlob(canvas, "image/webp", 0.9);
  }

  throw new Error(`Unsupported image export format: ${format}`);
}

async function downloadPrimaryImageAs(format) {
  const item = primaryImageItem();
  if (!item) {
    setStatus("No screenshot is available for this export.", true);
    return;
  }

  const source = await getMediaBlob(item.id);
  if (!(source instanceof Blob)) {
    setStatus("Screenshot source is unavailable.", true);
    return;
  }

  try {
    const blob = await convertImageBlobFormat(source, format);
    const ext = format === "jpg" ? "jpg" : format;
    await downloadBlob(blob, `Olho/${safeFilename(itemTitle(item))}-${Date.now()}.${ext}`);
    setStatus(`${format.toUpperCase()} download started.`);
  } catch (error) {
    console.error(error);
    setStatus(`${format.toUpperCase()} export failed.`, true);
  }
}

async function copyPrimaryImageFromSelection() {
  const item = primaryImageItem();
  if (!item) {
    setStatus("No screenshot is available to copy.", true);
    return;
  }
  await copyItemFile(item);
}

function buildSingleImagePdfBlob(jpegBytes, width, height) {
  const chunks = [];
  const offsets = [0];
  let offset = 0;

  const push = (bytes) => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const pushText = (text) => push(encoder.encode(text));

  pushText("%PDF-1.4\n");
  offsets[1] = offset;
  pushText("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  offsets[2] = offset;
  pushText("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  offsets[3] = offset;
  pushText(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );
  offsets[4] = offset;
  pushText(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  push(jpegBytes);
  pushText("\nendstream\nendobj\n");
  const content = encoder.encode(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`);
  offsets[5] = offset;
  pushText(`5 0 obj\n<< /Length ${content.length} >>\nstream\n`);
  push(content);
  pushText("\nendstream\nendobj\n");

  const xrefStart = offset;
  pushText("xref\n0 6\n");
  pushText("0000000000 65535 f \n");
  for (let i = 1; i <= 5; i += 1) {
    pushText(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob([joinUint8(chunks)], { type: "application/pdf" });
}

async function tryLegacyImageClipboardCopy(blob) {
  if (!(blob instanceof Blob)) return false;
  if (!blob.type.startsWith("image/")) return false;
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;

  const url = URL.createObjectURL(blob);
  const container = document.createElement("div");
  container.contentEditable = "true";
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.opacity = "0";
  container.setAttribute("aria-hidden", "true");

  const image = document.createElement("img");
  image.src = url;
  image.alt = "";
  container.append(image);
  document.body.append(container);

  try {
    await new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load image for legacy clipboard copy."));
    });

    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.selectNodeContents(container);
    selection.removeAllRanges();
    selection.addRange(range);

    const copied = document.execCommand("copy");
    selection.removeAllRanges();
    return Boolean(copied);
  } catch (error) {
    console.error(error);
    return false;
  } finally {
    URL.revokeObjectURL(url);
    container.remove();
  }
}

async function copyItemFile(item) {
  const blob = await getMediaBlob(item.id);
  if (!(blob instanceof Blob)) {
    setStatus("Source file is unavailable for this item.", true);
    return;
  }

  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      const mimeType = blob.type || (item.type === "video" ? "video/webm" : "image/png");
      const payload = {
        [mimeType]: blob
      };
      if (!mimeType.startsWith("image/")) {
        payload["application/octet-stream"] = blob;
      }
      await navigator.clipboard.write([new ClipboardItem(payload)]);
      setStatus(`${item.type === "video" ? "Video" : "Image"} file copied to clipboard.`);
      return;
    }

    const legacyCopied = await tryLegacyImageClipboardCopy(blob);
    if (legacyCopied) {
      setStatus("Image copied using legacy clipboard fallback.");
      return;
    }
  } catch (error) {
    console.error(error);
    const legacyCopied = await tryLegacyImageClipboardCopy(blob);
    if (legacyCopied) {
      setStatus("Image copied using legacy clipboard fallback.");
      return;
    }
  }

  await downloadBlob(blob, createCopyFilename(item));
  setStatus(
    item.type === "video"
      ? "Clipboard video copy is not available in this environment. File downloaded for manual attachment."
      : "Clipboard image copy is unavailable. File downloaded for manual attachment. Use Open Editor and Copy for another local copy attempt."
  );
}

function renderItems() {
  itemsContainer.innerHTML = "";

  if (!state.filteredItems.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No items matched the current filters.";
    itemsContainer.append(empty);
    return;
  }

  const entriesById = new Map(buildReportEntries().map((entry) => [entry.id, entry]));

  state.filteredItems.forEach((item) => {
    const entry = entriesById.get(item.id);
    const row = document.createElement("article");
    row.className = "item-row";
    row.setAttribute("role", "listitem");

    const left = document.createElement("div");
    left.className = "item-main";

    const title = document.createElement("strong");
    title.className = "item-title";
    title.textContent = entry.title;

    const meta = document.createElement("p");
    meta.className = "item-meta";
    meta.textContent = [
      entry.captureType,
      formatDate(entry.captureDate),
      formatBytes(entry.sizeBytes || 0),
      entry.durationMs ? `${Math.round(entry.durationMs / 1000)}s` : ""
    ]
      .filter(Boolean)
      .join(" | ");

    const facts = document.createElement("div");
    facts.className = "item-facts";
    const factRows = [
      ["Source title", entry.sourcePageTitle || "(not available)"],
      ["Source URL", entry.sourceUrl || "(not stored or excluded)"],
      ["Filename", entry.filename],
      ["Tags", entry.tags.join(", ") || "(none)"],
      ["Annotation summary", entry.annotationSummary || "(none)"]
    ];
    factRows.forEach(([label, value]) => {
      const fact = document.createElement("p");
      fact.className = "item-fact";
      fact.innerHTML = `<span class="fact-label">${escapeHtml(label)}:</span> ${escapeHtml(value)}`;
      facts.append(fact);
    });

    left.append(title, meta, facts);

    const actions = document.createElement("div");
    actions.className = "item-actions";
    const primaryActions = document.createElement("div");
    primaryActions.className = "item-primary-actions";
    const secondaryActions = document.createElement("div");
    secondaryActions.className = "item-secondary-actions";
    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "ghost";
    downloadBtn.textContent = "Download File";
    downloadBtn.setAttribute("aria-label", `Download file for ${entry.title}`);
    downloadBtn.addEventListener("click", () => {
      downloadItemFile(item).catch((error) => {
        console.error(error);
        setStatus("File download failed.", true);
      });
    });

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "ghost";
    copyBtn.textContent = "Copy File";
    copyBtn.setAttribute("aria-label", `Copy file for ${entry.title}`);
    copyBtn.addEventListener("click", () => {
      copyItemFile(item).catch((error) => {
        console.error(error);
        setStatus("File copy failed.", true);
      });
    });

    primaryActions.append(downloadBtn);

    if (item.type === "image") {
      const openEditorBtn = document.createElement("button");
      openEditorBtn.type = "button";
      openEditorBtn.className = "ghost";
      openEditorBtn.textContent = "Open Editor";
      openEditorBtn.setAttribute("aria-label", `Open editor for ${entry.title}`);
      openEditorBtn.addEventListener("click", () => {
        openEditorAndCopy(item, { copyAfterOpen: false }).catch((error) => {
          console.error(error);
          setStatus("Could not open editor.", true);
        });
      });
      primaryActions.append(openEditorBtn);
    }

    const sourceBtn = document.createElement("button");
    sourceBtn.type = "button";
    sourceBtn.className = "ghost";
    sourceBtn.textContent = "Set Source URL";
    sourceBtn.setAttribute("aria-label", `Set source URL for ${entry.title}`);
    sourceBtn.addEventListener("click", () => {
      promptAndSetSourceUrl(item).catch((error) => {
        console.error(error);
        setStatus("Could not update source URL.", true);
      });
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ghost";
    removeBtn.textContent = "Remove";
    removeBtn.setAttribute("aria-label", `Remove ${entry.title} from this export set`);
    removeBtn.addEventListener("click", () => {
      state.excludedItemIds.add(item.id);
      state.filteredItems = filterItems(state.items);
      renderFilterSummary();
      renderStats();
      renderItems();
      setStatus("Item removed from current export set.");
    });

    const more = document.createElement("details");
    more.className = "item-more-actions";
    const summary = document.createElement("summary");
    summary.textContent = "More actions";
    secondaryActions.append(copyBtn, sourceBtn, removeBtn);
    more.append(summary, secondaryActions);

    actions.append(primaryActions, more);
    row.append(left, actions);
    itemsContainer.append(row);
  });
}

async function copySummary() {
  try {
    const entries = buildReportEntries();
    await navigator.clipboard.writeText(markdownSummary(entries));
    setStatus("Send summary copied.");
  } catch (error) {
    console.error(error);
    setStatus("Failed to copy summary.", true);
  }
}

async function copyHtmlSnippet() {
  try {
    const entries = buildReportEntries();
    const html = htmlSummaryFragment(entries);
    const text = markdownSummary(entries);

    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" })
        })
      ]);
    } else {
      await navigator.clipboard.writeText(text);
    }

    setStatus("HTML summary copied.");
  } catch (error) {
    console.error(error);
    setStatus("Failed to copy HTML snippet.", true);
  }
}

function makeCanvas(width, height) {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  throw new Error("Canvas is unavailable in this environment.");
}

function getCanvas2d(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context is unavailable.");
  }
  return ctx;
}

async function canvasToBlob(canvas, mimeType = "image/jpeg", quality = 0.86) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: mimeType, quality });
  }
  if (typeof canvas.toBlob === "function") {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob instanceof Blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Failed to create Blob from canvas."));
      }, mimeType, quality);
    });
  }
  throw new Error("Canvas blob conversion is unavailable.");
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      return;
    }
    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word);
      current = "";
    }
  });

  if (current) lines.push(current);
  if (!lines.length) lines.push("");

  const limited = lines.slice(0, Math.max(1, maxLines));
  limited.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
  return limited.length;
}

async function getPreviewBlobForItem(item) {
  if (item.thumbnailId) {
    const thumb = await getThumbnailBlob(item.thumbnailId);
    if (thumb instanceof Blob) return thumb;
  }
  const original = await getMediaBlob(item.id);
  return original instanceof Blob ? original : null;
}

async function getPreviewBitmapForItem(item) {
  const blob = await getPreviewBlobForItem(item);
  if (!(blob instanceof Blob)) return null;
  if (typeof createImageBitmap !== "function") return null;
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

function drawPreviewOrPlaceholder(ctx, bitmap, x, y, width, height, entry) {
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(x, y, width, height);

  if (bitmap) {
    const fit = Math.min(width / bitmap.width, height / bitmap.height);
    const drawW = Math.max(1, Math.round(bitmap.width * fit));
    const drawH = Math.max(1, Math.round(bitmap.height * fit));
    const drawX = x + Math.round((width - drawW) / 2);
    const drawY = y + Math.round((height - drawH) / 2);
    ctx.drawImage(bitmap, drawX, drawY, drawW, drawH);
    bitmap.close?.();
    return;
  }

  ctx.strokeStyle = "#334155";
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 18px Arial";
  ctx.fillText(entry.kind === "video" ? "Recording Preview" : "Image Preview", x + 12, y + 30);
}

async function renderReportPagesToCanvases(entries) {
  const width = 1240;
  const height = 1754;
  const margin = 56;
  const rowHeight = 220;
  const rowGap = 18;
  const thumbWidth = 280;
  const thumbHeight = 158;

  const pages = [];
  let pageNumber = 0;
  let canvas = null;
  let ctx = null;
  let y = 0;

  const startPage = () => {
    pageNumber += 1;
    canvas = makeCanvas(width, height);
    ctx = getCanvas2d(canvas);

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#0f172a";
    ctx.font = "700 36px Arial";
    ctx.fillText("Olho Export Report", margin, margin + 8);
    ctx.font = "500 18px Arial";
    ctx.fillStyle = "#334155";
    ctx.fillText(`Generated locally: ${new Date().toISOString()}`, margin, margin + 44);
    ctx.fillText("Attach files manually. No upload and no hosted links.", margin, margin + 72);
    ctx.fillText(`Page ${pageNumber}`, width - margin - 90, margin + 44);

    y = margin + 106;
  };

  startPage();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (y + rowHeight > height - margin) {
      pages.push(canvas);
      startPage();
    }

    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(margin - 8, y - 8, width - margin * 2 + 16, rowHeight);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(margin - 4, y - 4, width - margin * 2 + 8, rowHeight - 8);
    ctx.strokeStyle = "#cbd5e1";
    ctx.strokeRect(margin - 4, y - 4, width - margin * 2 + 8, rowHeight - 8);

    const thumbX = margin + 10;
    const thumbY = y + 12;
    const textX = thumbX + thumbWidth + 22;
    const textW = width - margin - textX - 16;

    const previewBitmap = await getPreviewBitmapForItem(state.filteredItems[index]);
    drawPreviewOrPlaceholder(ctx, previewBitmap, thumbX, thumbY, thumbWidth, thumbHeight, entry);

    ctx.fillStyle = "#0f172a";
    ctx.font = "700 22px Arial";
    ctx.fillText(`${index + 1}. ${entry.title}`, textX, y + 34);

    ctx.font = "500 16px Arial";
    ctx.fillStyle = "#334155";
    let lineY = y + 60;
    lineY += drawWrappedText(ctx, `Capture date: ${entry.captureDate}`, textX, lineY, textW, 20, 1) * 20;
    lineY += drawWrappedText(ctx, `Capture type: ${entry.captureType}`, textX, lineY, textW, 20, 1) * 20;
    lineY += drawWrappedText(ctx, `Source page title: ${entry.sourcePageTitle || "(not available)"}`, textX, lineY, textW, 20, 1) * 20;
    lineY += drawWrappedText(ctx, `Source URL: ${entry.sourceUrl || "(not stored or excluded)"}`, textX, lineY, textW, 20, 1) * 20;
    lineY += drawWrappedText(ctx, `Filename: ${entry.filename}`, textX, lineY, textW, 20, 1) * 20;
    lineY += drawWrappedText(ctx, `Tags: ${entry.tags.join(", ") || "(none)"}`, textX, lineY, textW, 20, 1) * 20;
    lineY += drawWrappedText(ctx, `Notes: ${entry.notes || "(none)"}`, textX, lineY, textW, 20, 1) * 20;
    lineY += drawWrappedText(ctx, `Annotation summary: ${entry.annotationSummary || "(none)"}`, textX, lineY, textW, 20, 1) * 20;

    y += rowHeight + rowGap;
  }

  if (canvas) {
    pages.push(canvas);
  }

  return pages;
}

function buildPdfFromJpegPages(jpegPages) {
  const pageWidth = 595;
  const pageHeight = 842;
  const chunks = [];
  const offsets = [0];
  let pointer = 0;

  const push = (bytes) => {
    chunks.push(bytes);
    pointer += bytes.length;
  };

  const pushObject = (id, payloadBytes) => {
    offsets[id] = pointer;
    push(bytesFromString(`${id} 0 obj\n`));
    push(payloadBytes);
    push(bytesFromString("\nendobj\n"));
  };

  push(bytesFromString("%PDF-1.4\n"));

  const pageCount = Math.max(1, jpegPages.length);
  const pageIds = [];
  const imageIds = [];
  const contentIds = [];
  let objectId = 3;
  for (let i = 0; i < pageCount; i += 1) {
    pageIds.push(objectId++);
    imageIds.push(objectId++);
    contentIds.push(objectId++);
  }
  const maxObjectId = objectId - 1;

  pushObject(1, bytesFromString("<< /Type /Catalog /Pages 2 0 R >>"));
  pushObject(2, bytesFromString(`<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`));

  for (let i = 0; i < pageCount; i += 1) {
    const pageId = pageIds[i];
    const imageId = imageIds[i];
    const contentId = contentIds[i];
    const imageBytes = jpegPages[i] || new Uint8Array();

    pushObject(
      pageId,
      bytesFromString(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
      )
    );

    const imageHeader = bytesFromString(
      `<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`
    );
    const imageFooter = bytesFromString("\nendstream");
    pushObject(imageId, joinUint8([imageHeader, imageBytes, imageFooter]));

    const contentBytes = bytesFromString(
      `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`
    );
    const contentHeader = bytesFromString(`<< /Length ${contentBytes.length} >>\nstream\n`);
    const contentFooter = bytesFromString("endstream");
    pushObject(contentId, joinUint8([contentHeader, contentBytes, contentFooter]));
  }

  const xrefStart = pointer;
  push(bytesFromString(`xref\n0 ${maxObjectId + 1}\n`));
  push(bytesFromString("0000000000 65535 f \n"));
  for (let id = 1; id <= maxObjectId; id += 1) {
    const value = String(offsets[id] || 0).padStart(10, "0");
    push(bytesFromString(`${value} 00000 n \n`));
  }
  push(bytesFromString(`trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`));

  return new Blob([joinUint8(chunks)], { type: "application/pdf" });
}

async function buildReportPdfBlob(entries) {
  const canvases = await renderReportPagesToCanvases(entries);
  const jpegPages = [];
  for (const canvas of canvases) {
    const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.88);
    jpegPages.push(new Uint8Array(await jpegBlob.arrayBuffer()));
  }
  return buildPdfFromJpegPages(jpegPages);
}

async function downloadMarkdown() {
  try {
    const entries = buildReportEntries();
    const markdown = markdownSummary(entries);
    await downloadBlob(
      new Blob([markdown], { type: "text/markdown" }),
      `Olho/olho-report-${Date.now()}.md`
    );
    setStatus("Markdown download started.");
  } catch (error) {
    console.error(error);
    setStatus("Failed to download Markdown.", true);
  }
}

async function downloadTextSummary() {
  try {
    const entries = buildReportEntries();
    const text = summaryBodyText(entries);
    await downloadBlob(
      new Blob([text], { type: "text/plain" }),
      `Olho/olho-report-${Date.now()}.txt`
    );
    setStatus("Text summary download started.");
  } catch (error) {
    console.error(error);
    setStatus("Failed to download text summary.", true);
  }
}

async function downloadHtmlReport() {
  try {
    const entries = buildReportEntries();
    const html = fullReportDocument(entries);
    await downloadBlob(
      new Blob([html], { type: "text/html" }),
      `Olho/olho-report-${Date.now()}.html`
    );
    setStatus("HTML report download started.");
  } catch (error) {
    console.error(error);
    setStatus("Failed to download HTML report.", true);
  }
}

async function downloadHtmlSummary() {
  try {
    const entries = buildReportEntries();
    const notes = sanitizeText(shareNotes.value || "");
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Olho Export Summary</title>
  </head>
  <body>
    <h1>Olho Export Summary</h1>
    <p>Generated: ${escapeHtml(new Date().toISOString())}</p>
    ${notes ? `<p>Notes: ${escapeHtml(notes)}</p>` : ""}
    ${htmlSummaryFragment(entries)}
  </body>
</html>`;
    await downloadBlob(
      new Blob([html], { type: "text/html" }),
      `Olho/olho-summary-${Date.now()}.html`
    );
    setStatus("HTML summary download started.");
  } catch (error) {
    console.error(error);
    setStatus("Failed to download HTML summary.", true);
  }
}

function bytesFromString(text) {
  return encoder.encode(text);
}

function joinUint8(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

async function downloadPdfReport() {
  try {
    const item = primaryImageItem();
    if (item) {
      const source = await getMediaBlob(item.id);
      if (!(source instanceof Blob)) {
        setStatus("Screenshot source is unavailable.", true);
        return;
      }
      const bitmap = await createImageBitmap(source);
      const canvas = makeCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (!context) {
        bitmap.close?.();
        throw new Error("Canvas is unavailable for PDF export.");
      }
      context.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
      const pdfBlob = buildSingleImagePdfBlob(jpegBytes, canvas.width, canvas.height);
      await downloadBlob(pdfBlob, `Olho/${safeFilename(itemTitle(item))}-${Date.now()}.pdf`);
      setStatus("PDF download started.");
      return;
    }

    const entries = buildReportEntries();
    const reportPdfBlob = await buildReportPdfBlob(entries);
    await downloadBlob(reportPdfBlob, `Olho/olho-report-${Date.now()}.pdf`);
    setStatus("PDF report download started.");
  } catch (error) {
    console.error(error);
    setStatus("Failed to download PDF.", true);
  }
}

async function downloadJsonMetadata() {
  try {
    const entries = buildReportEntries();
    const payload = reportJson(entries);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    await downloadBlob(blob, `Olho/olho-report-${Date.now()}.json`);
    setStatus("JSON metadata download started.");
  } catch (error) {
    console.error(error);
    setStatus("Failed to download JSON metadata.", true);
  }
}

async function openJiraDraft() {
  const base = ensureHttpUrl(cleanBaseUrl(jiraUrl.value));
  if (!base) {
    setStatus("Set Jira issue URL first.", true);
    jiraUrl.focus();
    return;
  }

  const entries = buildReportEntries();
  const url = `${base}/secure/CreateIssueDetails!init.jspa?summary=${encodeURIComponent(
    buildIssueSubject()
  )}&description=${encodeURIComponent(shareBody(entries))}`;
  await chrome.tabs.create({ url });
  setStatus("Jira issue draft opened. Attach files manually.");
}

async function openGithubDraft() {
  const base = ensureHttpUrl(cleanBaseUrl(githubIssueUrl.value));
  if (!base) {
    setStatus("Set GitHub issue URL first.", true);
    githubIssueUrl.focus();
    return;
  }

  const entries = buildReportEntries();
  const sep = base.includes("?") ? "&" : "?";
  const url = `${base}${sep}title=${encodeURIComponent(buildIssueSubject())}&body=${encodeURIComponent(shareBody(entries))}`;
  await chrome.tabs.create({ url });
  setStatus("GitHub issue draft opened. Attach files manually.");
}

async function openTrelloDraft() {
  const raw = cleanBaseUrl(trelloCardUrl.value) || "trello.com/add-card";
  const base = ensureHttpUrl(raw);
  if (!base) {
    setStatus("Set Trello card URL first.", true);
    trelloCardUrl.focus();
    return;
  }

  const entries = buildReportEntries();
  const sep = base.includes("?") ? "&" : "?";
  const url = `${base}${sep}name=${encodeURIComponent(buildIssueSubject())}&desc=${encodeURIComponent(shareBody(entries))}`;
  await chrome.tabs.create({ url });
  setStatus("Trello card draft opened. Attach files manually.");
}

async function openMailDraft() {
  const entries = buildReportEntries();
  const subject = buildIssueSubject();
  const body = shareBody(entries);
  const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await chrome.tabs.create({ url });
  setStatus("Email draft opened. Attach files manually.");
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(now = new Date()) {
  const year = Math.max(1980, now.getFullYear());
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = Math.floor(now.getSeconds() / 2);
  const date = ((year - 1980) << 9) | (month << 5) | day;
  const time = (hours << 11) | (minutes << 5) | seconds;
  return { date, time };
}

function concatArrays(chunks, totalLength) {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
}

async function createZipBlob(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(data);
    const { date, time } = dosDateTime();

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lh = new DataView(localHeader.buffer);
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const ch = new DataView(centralHeader.buffer);
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    localOffset += localHeader.length + data.length;
  }

  const centralLength = centralParts.reduce((sum, chunk) => sum + chunk.length, 0);
  const localLength = localParts.reduce((sum, chunk) => sum + chunk.length, 0);

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralLength, true);
  ev.setUint32(16, localLength, true);
  ev.setUint16(20, 0, true);

  const all = concatArrays([...localParts, ...centralParts, end], localLength + centralLength + end.length);
  return new Blob([all], { type: "application/zip" });
}

async function downloadZipBundle() {
  try {
    setStatus("Preparing local bundle...");
    const entries = buildReportEntries();
    const markdown = markdownSummary(entries);
    const text = summaryBodyText(entries);
    const html = fullReportDocument(entries);
    const htmlSummary = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Olho Export Summary</title>
  </head>
  <body>
    <h1>Olho Export Summary</h1>
    ${htmlSummaryFragment(entries)}
  </body>
</html>`;
    const json = reportJson(entries);
    const pdf = await buildReportPdfBlob(entries);

    const zipEntries = [
      { name: "report/report.md", blob: new Blob([markdown], { type: "text/markdown" }) },
      { name: "report/report.txt", blob: new Blob([text], { type: "text/plain" }) },
      { name: "report/report.html", blob: new Blob([html], { type: "text/html" }) },
      { name: "report/summary.html", blob: new Blob([htmlSummary], { type: "text/html" }) },
      { name: "report/report.pdf", blob: pdf },
      {
        name: "report/metadata.json",
        blob: new Blob([JSON.stringify(json, null, 2)], { type: "application/json" })
      }
    ];

    const usedNames = new Set(zipEntries.map((entry) => entry.name));
    for (const item of state.filteredItems) {
      const blob = await getMediaBlob(item.id);
      if (!(blob instanceof Blob)) continue;

      const base = safeFilename(itemTitle(item)) || "item";
      const ext = extensionFromItem(item);
      let fileName = `media/${base}.${ext}`;
      let suffix = 2;
      while (usedNames.has(fileName)) {
        fileName = `media/${base}-${suffix}.${ext}`;
        suffix += 1;
      }
      usedNames.add(fileName);
      zipEntries.push({ name: fileName, blob });
    }

    const zipBlob = await createZipBlob(zipEntries);
    await downloadBlob(zipBlob, `Olho/olho-share-bundle-${Date.now()}.zip`);
    setStatus("Bundle download started. Attach files manually.");
  } catch (error) {
    console.error(error);
    setStatus("Failed to build local bundle.", true);
  }
}

async function printSelection() {
  try {
    const entries = buildReportEntries();
    const item = primaryImageItem();
    let imageSection = "<p>No screenshot selected. Printing report summary only.</p>";
    let objectUrl = "";

    if (item) {
      const blob = await getMediaBlob(item.id);
      if (blob instanceof Blob && blob.type.startsWith("image/")) {
        objectUrl = URL.createObjectURL(blob);
        imageSection = `<figure style="margin:0 0 16px 0;">
  <img src="${objectUrl}" alt="${escapeHtml(itemTitle(item))}" style="max-width:100%;height:auto;border:1px solid #ccc;" />
  <figcaption style="margin-top:8px;">${escapeHtml(itemTitle(item))}</figcaption>
</figure>`;
      }
    }

    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setStatus("Print window was blocked. Allow popups and try again.", true);
      return;
    }

    const doc = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Olho Print</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 16px; color: #111; }
      h1, h2 { margin: 0 0 12px 0; }
      p { margin: 0 0 10px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #ddd; padding: 6px; text-align: left; vertical-align: top; }
      th { background: #f2f4f7; }
    </style>
  </head>
  <body>
    <h1>Olho Export Print</h1>
    <p>Generated locally. Attach files manually.</p>
    ${imageSection}
    ${htmlSummaryFragment(entries)}
    <script>
      window.addEventListener("load", () => {
        setTimeout(() => {
          window.print();
        }, 120);
      });
    </script>
  </body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(doc);
    printWindow.document.close();

    if (objectUrl) {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    }
    setStatus("Print view opened.");
  } catch (error) {
    console.error(error);
    setStatus("Failed to open print view.", true);
  }
}

async function refresh() {
  try {
    const [items, folders] = await Promise.all([listItems(), listFolders()]);
    state.items = items;
    state.folders = folders;
    state.excludedItemIds.clear();
    state.filteredItems = filterItems(items);

    renderFilterSummary();
    renderStats();
    renderItems();
    setStatus("Send View ready.");
  } catch (error) {
    console.error(error);
    setStatus("Failed to refresh Send View.", true);
  }
}
