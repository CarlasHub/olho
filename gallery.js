import {
  clearAllData,
  createFolder,
  createItem,
  deleteFolder,
  deleteItem,
  exportAllMetadata,
  getAppSettings,
  getMediaBlob,
  getStorageUsage,
  getThumbnailBlob,
  listFolders,
  listItems,
  listLargestMedia,
  listTags,
  listTrash,
  moveItem,
  permanentlyDelete,
  renameFolder,
  renameItem,
  restoreFromTrash,
  updateMediaMetadata
} from "./src/storage/storage.js";
import {
  formatBytes,
  formatDate,
  formatDuration,
  normalizeTagsInput,
  safeFilename,
  sanitizeText
} from "./src/gallery/format-utils.js";
import { createGalleryCardView } from "./src/gallery/card-view.js";
import {
  isReviewWorkspaceItem,
  reviewWorkspaceStats,
  reviewWorkspaceSummaryForItem
} from "./src/gallery/review-workspace-summary.js";
import { installRuntimeGuard } from "./src/shared/runtime-guard.js";
import { importDesignScreenshotForReview } from "./src/review/design/design-import-controller.js";

const viewButtons = Array.from(document.querySelectorAll(".view-btn[data-view]"));

const newFolderName = document.getElementById("newFolderName");
const createFolderBtn = document.getElementById("createFolderBtn");
const folderList = document.getElementById("folderList");
const tagList = document.getElementById("tagList");

const itemCount = document.getElementById("itemCount");
const reviewWorkspaceItemCount = document.getElementById("reviewWorkspaceItemCount");
const reviewWorkspaceReviewedCount = document.getElementById("reviewWorkspaceReviewedCount");
const reviewWorkspaceFindingCount = document.getElementById("reviewWorkspaceFindingCount");
const reviewWorkspaceReportCount = document.getElementById("reviewWorkspaceReportCount");
const filterToolbar = document.getElementById("filterToolbar");
const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const folderFilter = document.getElementById("folderFilter");
const tagFilter = document.getElementById("tagFilter");
const favouriteFilter = document.getElementById("favouriteFilter");
const sortSelect = document.getElementById("sortSelect");
const refreshBtn = document.getElementById("refreshBtn");
const importDesignReviewBtn = document.getElementById("importDesignReviewBtn");
const designReviewImportInput = document.getElementById("designReviewImportInput");

const bulkToolbar = document.getElementById("bulkToolbar");
const selectAllToggle = document.getElementById("selectAllToggle");
const selectionCount = document.getElementById("selectionCount");
const bulkMoveGroup = document.getElementById("bulkMoveGroup");
const bulkFolderSelect = document.getElementById("bulkFolderSelect");
const bulkMoveBtn = document.getElementById("bulkMoveBtn");
const bulkTagGroup = document.getElementById("bulkTagGroup");
const bulkTagInput = document.getElementById("bulkTagInput");
const bulkTagBtn = document.getElementById("bulkTagBtn");
const bulkFavouriteBtn = document.getElementById("bulkFavouriteBtn");
const bulkUnfavouriteBtn = document.getElementById("bulkUnfavouriteBtn");
const bulkZipBtn = document.getElementById("bulkZipBtn");
const bulkMetadataBtn = document.getElementById("bulkMetadataBtn");
const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
const bulkRestoreBtn = document.getElementById("bulkRestoreBtn");
const bulkPermanentDeleteBtn = document.getElementById("bulkPermanentDeleteBtn");
const bulkClearSelectionBtn = document.getElementById("bulkClearSelectionBtn");
const bulkMoreActions = document.getElementById("bulkMoreActions");
const selectionLive = document.getElementById("selectionLive");

const libraryView = document.getElementById("libraryView");
const galleryGrid = document.getElementById("galleryGrid");
const emptyState = document.getElementById("emptyState");

const storageView = document.getElementById("storageView");
const usageStats = document.getElementById("usageStats");
const largestList = document.getElementById("largestList");
const exportBeforeDeleteBtn = document.getElementById("exportBeforeDeleteBtn");
const deleteAllBtn = document.getElementById("deleteAllBtn");

const inspectorEmpty = document.getElementById("inspectorEmpty");
const inspectorBody = document.getElementById("inspectorBody");
const inspectorPreviewImage = document.getElementById("inspectorPreviewImage");
const inspectorPreviewVideo = document.getElementById("inspectorPreviewVideo");
const inspectorTitleValue = document.getElementById("inspectorTitleValue");
const inspectorTypeValue = document.getElementById("inspectorTypeValue");
const inspectorDateValue = document.getElementById("inspectorDateValue");
const inspectorSizeValue = document.getElementById("inspectorSizeValue");
const inspectorReviewTypeValue = document.getElementById("inspectorReviewTypeValue");
const inspectorFindingsValue = document.getElementById("inspectorFindingsValue");
const inspectorReportValue = document.getElementById("inspectorReportValue");
const inspectorTagsValue = document.getElementById("inspectorTagsValue");
const inspectorFolderValue = document.getElementById("inspectorFolderValue");
const inspectorOpenBtn = document.getElementById("inspectorOpenBtn");
const inspectorReviewBtn = document.getElementById("inspectorReviewBtn");
const inspectorRenameBtn = document.getElementById("inspectorRenameBtn");
const inspectorFavouriteBtn = document.getElementById("inspectorFavouriteBtn");
const inspectorTagsBtn = document.getElementById("inspectorTagsBtn");
const inspectorMoveBtn = document.getElementById("inspectorMoveBtn");
const inspectorDeleteBtn = document.getElementById("inspectorDeleteBtn");
const inspectorRestoreBtn = document.getElementById("inspectorRestoreBtn");
const inspectorPermanentDeleteBtn = document.getElementById("inspectorPermanentDeleteBtn");

const confirmDialog = document.getElementById("confirmDialog");
const confirmTitle = document.getElementById("confirmTitle");
const confirmBody = document.getElementById("confirmBody");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmAcceptBtn = document.getElementById("confirmAcceptBtn");

const inputDialog = document.getElementById("inputDialog");
const inputDialogTitle = document.getElementById("inputDialogTitle");
const inputDialogBody = document.getElementById("inputDialogBody");
const inputDialogField = document.getElementById("inputDialogField");
const inputDialogCancelBtn = document.getElementById("inputDialogCancelBtn");
const inputDialogAcceptBtn = document.getElementById("inputDialogAcceptBtn");

const previewDialog = document.getElementById("previewDialog");
const previewVideo = document.getElementById("previewVideo");
const previewCloseBtn = document.getElementById("previewCloseBtn");

const toast = document.getElementById("toast");

const VIEW_MODES = [
  "all",
  "reviews",
  "screenshots",
  "imports",
  "edited",
  "recordings",
  "favourites",
  "recent",
  "folders",
  "tags",
  "trash",
  "storage"
];

const state = {
  view: "all",
  items: [],
  folders: [],
  tags: [],
  trash: [],
  usage: null,
  largest: [],
  appSettings: null,
  filters: {
    query: "",
    type: "all",
    folderId: "",
    tag: "",
    favourite: "all",
    sort: "newest"
  },
  activeFolderId: "",
  activeTag: "",
  selectedMediaIds: new Set(),
  selectedTrashIds: new Set()
};

const objectUrls = new Map();
const encoder = new TextEncoder();
const crcTable = buildCrcTable();
let toastTimer = null;
let dialogResolver = null;
let dialogInvoker = null;
let previewBlobUrl = "";
let cardView = null;

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.style.borderColor = isError ? "rgba(255, 122, 139, 0.8)" : "rgba(99, 211, 255, 0.6)";
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
}

installRuntimeGuard({
  onError(message) {
    showToast(`Unexpected error: ${message}`, true);
  }
});

function trackObjectUrl(key, blob) {
  const existing = objectUrls.get(key);
  if (existing) {
    URL.revokeObjectURL(existing);
  }
  const url = URL.createObjectURL(blob);
  objectUrls.set(key, url);
  return url;
}

function clearObjectUrls() {
  for (const [, url] of objectUrls) {
    URL.revokeObjectURL(url);
  }
  objectUrls.clear();
}

function closePreviewDialog() {
  if (previewBlobUrl) {
    URL.revokeObjectURL(previewBlobUrl);
    previewBlobUrl = "";
  }
  previewVideo.pause();
  previewVideo.removeAttribute("src");
  previewVideo.load();
}

function setView(view) {
  if (!VIEW_MODES.includes(view)) {
    state.view = "all";
  } else {
    state.view = view;
  }

  viewButtons.forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });

  const isMedia = !["storage"].includes(state.view);
  libraryView.classList.toggle("hidden", !isMedia);
  filterToolbar.classList.toggle("hidden", !isMedia || state.view === "trash");
  bulkToolbar.hidden = true;
  storageView.classList.toggle("hidden", state.view !== "storage");

  if (state.view === "storage" && !storageView.classList.contains("hidden")) {
    storageView.scrollIntoView({ block: "start", behavior: "auto" });
  }

  render();
}

function isTrashView() {
  return state.view === "trash";
}

function isMediaCardView() {
  return !["storage"].includes(state.view);
}

function folderName(folderId) {
  const folder = state.folders.find((entry) => entry.id === folderId);
  return folder?.name || "In Sight";
}

function itemTitle(item) {
  return sanitizeText(item.metadata?.title || "Untitled") || "Untitled";
}

function itemSize(item) {
  return Number(item.metadata?.sizeBytes || 0);
}

function itemType(item) {
  return item.type === "video" ? "video" : "image";
}

function itemTags(item) {
  return Array.isArray(item.metadata?.tags) ? item.metadata.tags : [];
}

function itemSourceType(item) {
  return String(item?.metadata?.sourceType || item?.sourceType || "").trim();
}

function isImportedItem(item) {
  const sourceType = itemSourceType(item).toLowerCase();
  return (
    sourceType === "local-import" ||
    sourceType === "clipboard-import" ||
    sourceType === "import" ||
    Boolean(item?.metadata?.imported)
  );
}

function isEditedImage(item) {
  if (itemType(item) !== "image") return false;
  const sourceType = itemSourceType(item).toLowerCase();
  return (
    sourceType === "edited" ||
    Boolean(item?.metadata?.edited) ||
    Boolean(item?.metadata?.olhoProject)
  );
}

function filteredMediaItems() {
  let list = [...state.items];

  if (state.view === "screenshots") {
    list = list.filter((item) => itemType(item) === "image");
  }

  if (state.view === "reviews") {
    list = list.filter((item) => isReviewWorkspaceItem(item));
  }

  if (state.view === "imports") {
    list = list.filter((item) => itemType(item) === "image" && isImportedItem(item));
  }

  if (state.view === "edited") {
    list = list.filter((item) => isEditedImage(item));
  }

  if (state.view === "recordings") {
    list = list.filter((item) => itemType(item) === "video");
  }

  if (state.view === "favourites") {
    list = list.filter((item) => Boolean(item.metadata?.favourite));
  }

  if (state.view === "folders" && state.activeFolderId) {
    list = list.filter((item) => item.folderId === state.activeFolderId);
  }

  if (state.view === "tags" && state.activeTag) {
    list = list.filter((item) => itemTags(item).includes(state.activeTag));
  }

  if (state.filters.type !== "all") {
    list = list.filter((item) => itemType(item) === state.filters.type);
  }

  if (state.filters.folderId) {
    list = list.filter((item) => item.folderId === state.filters.folderId);
  }

  if (state.filters.tag) {
    list = list.filter((item) => itemTags(item).includes(state.filters.tag));
  }

  if (state.filters.favourite === "only") {
    list = list.filter((item) => Boolean(item.metadata?.favourite));
  } else if (state.filters.favourite === "none") {
    list = list.filter((item) => !item.metadata?.favourite);
  }

  const query = sanitizeText(state.filters.query).toLowerCase();
  if (query) {
    list = list.filter((item) => {
      const title = itemTitle(item).toLowerCase();
      if (title.includes(query)) return true;
      return itemTags(item).some((tag) => tag.toLowerCase().includes(query));
    });
  }

  const sort = state.view === "recent" ? "newest" : state.filters.sort;

  list.sort((a, b) => {
    if (sort === "oldest") {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }
    if (sort === "name") {
      return itemTitle(a).localeCompare(itemTitle(b));
    }
    if (sort === "size") {
      return itemSize(b) - itemSize(a);
    }
    if (sort === "type") {
      const typeCmp = itemType(a).localeCompare(itemType(b));
      if (typeCmp !== 0) return typeCmp;
      return itemTitle(a).localeCompare(itemTitle(b));
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return list;
}

function filteredTrashEntries() {
  const query = sanitizeText(state.filters.query).toLowerCase();
  const entries = [...state.trash]
    .filter((entry) => {
      if (!query) return true;
      return String(entry.title || "").toLowerCase().includes(query);
    })
    .sort((a, b) => {
      if (state.filters.sort === "oldest") {
        return new Date(a.deletedAt) - new Date(b.deletedAt);
      }
      if (state.filters.sort === "name") {
        return String(a.title || "").localeCompare(String(b.title || ""));
      }
      return new Date(b.deletedAt) - new Date(a.deletedAt);
    });

  return entries;
}

function visibleMediaIds() {
  return filteredMediaItems().map((item) => item.id);
}

function visibleTrashIds() {
  return filteredTrashEntries().map((entry) => entry.id);
}

function updateSelectionUi() {
  const selected = isTrashView() ? state.selectedTrashIds.size : state.selectedMediaIds.size;
  bulkToolbar.hidden = !isMediaCardView() || selected === 0;
  selectionCount.textContent = `${selected} selected`;
  selectionLive.textContent = `${selected} memory item${selected === 1 ? "" : "s"} selected.`;

  const trashView = isTrashView();
  if (bulkMoveGroup) bulkMoveGroup.hidden = trashView;
  if (bulkTagGroup) bulkTagGroup.hidden = trashView;
  if (bulkZipBtn) bulkZipBtn.hidden = trashView;
  if (bulkDeleteBtn) bulkDeleteBtn.hidden = trashView;
  if (bulkRestoreBtn) bulkRestoreBtn.hidden = !trashView;
  if (bulkPermanentDeleteBtn) bulkPermanentDeleteBtn.hidden = !trashView;
  if (bulkFavouriteBtn) bulkFavouriteBtn.hidden = trashView;
  if (bulkUnfavouriteBtn) bulkUnfavouriteBtn.hidden = trashView;
  if (bulkMetadataBtn) bulkMetadataBtn.hidden = false;
  if (bulkMoreActions) {
    bulkMoreActions.hidden = false;
  }

  if (trashView) {
    bulkMoveBtn.disabled = true;
    bulkTagBtn.disabled = true;
    bulkFavouriteBtn.disabled = true;
    bulkUnfavouriteBtn.disabled = true;
    bulkDeleteBtn.disabled = true;
    bulkZipBtn.disabled = true;
    bulkMetadataBtn.disabled = false;
    bulkRestoreBtn.disabled = selected === 0;
    bulkPermanentDeleteBtn.disabled = selected === 0;
    bulkFolderSelect.disabled = true;
    bulkTagInput.disabled = true;
  } else {
    bulkMoveBtn.disabled = selected === 0;
    bulkTagBtn.disabled = selected === 0;
    bulkFavouriteBtn.disabled = selected === 0;
    bulkUnfavouriteBtn.disabled = selected === 0;
    bulkDeleteBtn.disabled = selected === 0;
    bulkZipBtn.disabled = selected === 0;
    bulkMetadataBtn.disabled = selected === 0;
    bulkRestoreBtn.disabled = true;
    bulkPermanentDeleteBtn.disabled = true;
    bulkFolderSelect.disabled = false;
    bulkTagInput.disabled = false;
  }

  if (isMediaCardView()) {
    const ids = trashView ? visibleTrashIds() : visibleMediaIds();
    const selectedIds = trashView ? state.selectedTrashIds : state.selectedMediaIds;
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    selectAllToggle.checked = allSelected;
    selectAllToggle.indeterminate = !allSelected && selectedIds.size > 0;
  }

  updateInspectorPanel();
}

function selectedInspectorItem() {
  if (isTrashView()) {
    for (const id of state.selectedTrashIds) {
      const entry = state.trash.find((item) => item.id === id);
      if (entry) return entry;
    }
    return null;
  }

  for (const id of state.selectedMediaIds) {
    const item = state.items.find((entry) => entry.id === id);
    if (item) return item;
  }
  return null;
}

function updateInspectorPanel() {
  if (!inspectorEmpty || !inspectorBody) return;

  const selected = selectedInspectorItem();
  if (!selected) {
    inspectorBody.hidden = true;
    inspectorEmpty.hidden = false;
    if (inspectorReviewTypeValue) inspectorReviewTypeValue.textContent = "-";
    if (inspectorFindingsValue) inspectorFindingsValue.textContent = "-";
    if (inspectorReportValue) inspectorReportValue.textContent = "-";
    if (inspectorPreviewImage) {
      inspectorPreviewImage.hidden = true;
      inspectorPreviewImage.removeAttribute("src");
    }
    if (inspectorPreviewVideo) {
      inspectorPreviewVideo.hidden = true;
      inspectorPreviewVideo.removeAttribute("src");
      inspectorPreviewVideo.load();
    }
    if (inspectorOpenBtn) inspectorOpenBtn.disabled = true;
    if (inspectorReviewBtn) {
      inspectorReviewBtn.hidden = true;
      inspectorReviewBtn.disabled = true;
    }
    if (inspectorRenameBtn) inspectorRenameBtn.disabled = true;
    if (inspectorFavouriteBtn) inspectorFavouriteBtn.disabled = true;
    if (inspectorTagsBtn) inspectorTagsBtn.disabled = true;
    if (inspectorMoveBtn) inspectorMoveBtn.disabled = true;
    if (inspectorDeleteBtn) inspectorDeleteBtn.disabled = true;
    if (inspectorRestoreBtn) inspectorRestoreBtn.disabled = true;
    if (inspectorPermanentDeleteBtn) inspectorPermanentDeleteBtn.disabled = true;
    return;
  }

  inspectorBody.hidden = false;
  inspectorEmpty.hidden = true;
  const trashView = isTrashView();

  const title = trashView ? sanitizeText(selected.title || "Untitled") : itemTitle(selected);
  const type = trashView
    ? selected.kind === "recording"
      ? "Recording (trash)"
      : "Screenshot (trash)"
    : itemType(selected) === "video"
      ? "Recording"
      : "Screenshot";
  const created = trashView ? selected.deletedAt || selected.createdAt : selected.createdAt;
  const size = trashView ? Number(selected.sizeBytes || 0) : itemSize(selected);
  const tags = trashView ? selected.tags || [] : itemTags(selected);
  const folder = folderName(selected.folderId);

  inspectorTitleValue.textContent = title || "-";
  inspectorTypeValue.textContent = type;
  inspectorDateValue.textContent = created ? formatDate(created) : "-";
  inspectorSizeValue.textContent = formatBytes(size);
  const reviewSummary = !trashView && selected.type === "image" ? reviewWorkspaceSummaryForItem(selected) : null;
  if (inspectorReviewTypeValue) {
    inspectorReviewTypeValue.textContent = reviewSummary ? reviewSummary.reviewType : "-";
  }
  if (inspectorFindingsValue) {
    inspectorFindingsValue.textContent = reviewSummary
      ? `${reviewSummary.findingCountLabel} | ${reviewSummary.severityText}`
      : "-";
  }
  if (inspectorReportValue) {
    inspectorReportValue.textContent = reviewSummary ? reviewSummary.reportStatus : "-";
  }
  inspectorTagsValue.textContent = tags.length ? tags.join(", ") : "No tags";
  inspectorFolderValue.textContent = folder;

  if (inspectorPreviewVideo) {
    inspectorPreviewVideo.hidden = true;
    inspectorPreviewVideo.removeAttribute("src");
    inspectorPreviewVideo.load();
  }

  if (inspectorPreviewImage) {
    if (selected.thumbUrl) {
      inspectorPreviewImage.hidden = false;
      inspectorPreviewImage.src = selected.thumbUrl;
      inspectorPreviewImage.alt = `${title} preview`;
    } else {
      inspectorPreviewImage.hidden = true;
      inspectorPreviewImage.removeAttribute("src");
    }
  }
  if (inspectorOpenBtn) {
    inspectorOpenBtn.hidden = trashView;
    inspectorOpenBtn.disabled = trashView;
  }
  if (inspectorReviewBtn) {
    const canReview = !trashView && itemType(selected) === "image";
    inspectorReviewBtn.hidden = !canReview;
    inspectorReviewBtn.disabled = !canReview;
  }
  if (inspectorRenameBtn) {
    inspectorRenameBtn.hidden = trashView;
    inspectorRenameBtn.disabled = trashView;
  }
  if (inspectorFavouriteBtn) {
    inspectorFavouriteBtn.hidden = trashView;
    inspectorFavouriteBtn.disabled = trashView;
    if (!trashView) {
      inspectorFavouriteBtn.textContent = selected.metadata?.favourite ? "Remove Sight Mark" : "Keep in Sight";
      inspectorFavouriteBtn.setAttribute(
        "aria-label",
        selected.metadata?.favourite ? "Remove from Kept in Sight" : "Mark as Kept in Sight"
      );
    }
  }
  if (inspectorTagsBtn) {
    inspectorTagsBtn.hidden = trashView;
    inspectorTagsBtn.disabled = trashView;
  }
  if (inspectorMoveBtn) {
    inspectorMoveBtn.hidden = trashView;
    inspectorMoveBtn.disabled = trashView;
  }
  if (inspectorDeleteBtn) {
    inspectorDeleteBtn.hidden = trashView;
    inspectorDeleteBtn.disabled = trashView;
  }
  if (inspectorRestoreBtn) {
    inspectorRestoreBtn.hidden = !trashView;
    inspectorRestoreBtn.disabled = !trashView;
  }
  if (inspectorPermanentDeleteBtn) {
    inspectorPermanentDeleteBtn.hidden = !trashView;
    inspectorPermanentDeleteBtn.disabled = !trashView;
  }
}

function renderFolderFilters() {
  const previous = folderFilter.value;
  const previousBulk = bulkFolderSelect.value;

  folderFilter.innerHTML = "";
  bulkFolderSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All folders";
  folderFilter.append(allOption);

  const moveDefault = document.createElement("option");
  moveDefault.value = "";
  moveDefault.textContent = "Move to folder";
  bulkFolderSelect.append(moveDefault);

  state.folders.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    folderFilter.append(option);

    const bulkOption = document.createElement("option");
    bulkOption.value = folder.id;
    bulkOption.textContent = folder.name;
    bulkFolderSelect.append(bulkOption);
  });

  if (previous && state.folders.some((folder) => folder.id === previous)) {
    folderFilter.value = previous;
  }

  if (previousBulk && state.folders.some((folder) => folder.id === previousBulk)) {
    bulkFolderSelect.value = previousBulk;
  }
}

function renderTagFilter() {
  const previous = tagFilter.value;
  tagFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All tags";
  tagFilter.append(allOption);

  state.tags
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag.name;
      option.textContent = `${tag.name} (${tag.usageCount || 0})`;
      tagFilter.append(option);
    });

  if (previous && state.tags.some((tag) => tag.name === previous)) {
    tagFilter.value = previous;
  }
}

function renderFolderList() {
  folderList.innerHTML = "";
  const counts = new Map();
  state.items.forEach((item) => {
    counts.set(item.folderId, (counts.get(item.folderId) || 0) + 1);
  });

  state.folders.forEach((folder) => {
    const row = document.createElement("div");
    row.className = "folder-row";
    row.setAttribute("role", "listitem");

    if (state.activeFolderId && state.activeFolderId === folder.id) {
      row.classList.add("active");
    }

    const meta = document.createElement("div");
    meta.className = "folder-meta";
    const title = document.createElement("strong");
    title.textContent = folder.name;
    const info = document.createElement("span");
    info.textContent = `${counts.get(folder.id) || 0} item(s)`;
    meta.append(title, info);

    const actions = document.createElement("div");

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "ghost";
    openBtn.textContent = "Open";
    openBtn.setAttribute("aria-label", `Open folder ${folder.name}`);
    openBtn.addEventListener("click", () => {
      state.activeFolderId = folder.id;
      state.filters.folderId = folder.id;
      folderFilter.value = folder.id;
      setView("folders");
    });

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "ghost";
    renameBtn.textContent = "Rename";
    renameBtn.disabled = Boolean(folder.isDefault);
    renameBtn.addEventListener("click", async () => {
      const next = await openInputDialog({
        invoker: renameBtn,
        title: "Rename folder",
        description: `Enter a new name for ${folder.name}.`,
        value: folder.name,
        acceptLabel: "Rename"
      });
      if (!next) return;
      try {
        await renameFolder(folder.id, next);
        showToast("Folder renamed.");
        await refresh();
      } catch (error) {
        console.error(error);
        showToast("Rename failed.", true);
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.disabled = Boolean(folder.isDefault);
    deleteBtn.addEventListener("click", async () => {
      const confirmed = await openConfirmDialog({
        invoker: deleteBtn,
        title: "Delete folder",
        message: `Delete folder "${folder.name}"? Its items move to In Sight.`,
        confirmLabel: "Delete"
      });
      if (!confirmed) return;
      try {
        await deleteFolder(folder.id);
        if (state.activeFolderId === folder.id) {
          state.activeFolderId = "";
        }
        showToast("Folder deleted.");
        await refresh();
      } catch (error) {
        console.error(error);
        showToast("Delete failed.", true);
      }
    });

    actions.append(openBtn, renameBtn, deleteBtn);
    row.append(meta, actions);
    folderList.append(row);
  });
}

function renderTagList() {
  tagList.innerHTML = "";

  if (!state.tags.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No tags in sight yet.";
    tagList.append(empty);
    return;
  }

  state.tags
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .forEach((tag) => {
      const row = document.createElement("div");
      row.className = "tag-row";
      row.setAttribute("role", "listitem");

      if (state.activeTag && state.activeTag === tag.name) {
        row.classList.add("active");
      }

      const meta = document.createElement("div");
      meta.className = "tag-meta";
      const name = document.createElement("strong");
      name.textContent = tag.name;
      const usage = document.createElement("span");
      usage.textContent = `${tag.usageCount || 0} item(s)`;
      meta.append(name, usage);

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "ghost";
      openBtn.textContent = "Filter";
      openBtn.setAttribute("aria-label", `Filter by tag ${tag.name}`);
      openBtn.addEventListener("click", () => {
        state.activeTag = tag.name;
        state.filters.tag = tag.name;
        tagFilter.value = tag.name;
        setView("tags");
      });

      row.append(meta, openBtn);
      tagList.append(row);
    });
}

function renderStorageStats() {
  usageStats.innerHTML = "";

  const usage = state.usage || {
    totalBytes: 0,
    mediaBytes: 0,
    thumbnailBytes: 0,
    draftBytes: 0,
    itemCount: 0,
    imageCount: 0,
    videoCount: 0,
    trashCount: 0,
    recordingDraftCount: 0
  };

  const cards = [
    ["Total size", formatBytes(usage.totalBytes)],
    ["Media size", formatBytes(usage.mediaBytes)],
    ["Thumbnail size", formatBytes(usage.thumbnailBytes)],
    ["Draft size", formatBytes(usage.draftBytes)],
    ["Captures", String(usage.itemCount || 0)],
    ["Screenshots", String(usage.imageCount || 0)],
    ["Recordings", String(usage.videoCount || 0)],
    ["Out of Sight", String(usage.trashCount || 0)],
    ["Unsaved drafts", String(usage.recordingDraftCount || 0)]
  ];

  cards.forEach(([label, value]) => {
    const box = document.createElement("article");
    box.className = "stat-box";
    const title = document.createElement("p");
    title.className = "label";
    title.textContent = label;
    const content = document.createElement("p");
    content.className = "value";
    content.textContent = value;
    box.append(title, content);
    usageStats.append(box);
  });
}

function renderReviewWorkspaceSummary() {
  const stats = reviewWorkspaceStats(state.items);
  if (reviewWorkspaceItemCount) reviewWorkspaceItemCount.textContent = String(stats.reviewableCount);
  if (reviewWorkspaceReviewedCount) reviewWorkspaceReviewedCount.textContent = String(stats.reviewedCount);
  if (reviewWorkspaceFindingCount) reviewWorkspaceFindingCount.textContent = String(stats.findingTotal);
  if (reviewWorkspaceReportCount) reviewWorkspaceReportCount.textContent = String(stats.exportedReports);
}

function renderLargestFiles() {
  largestList.innerHTML = "";

  if (!state.largest.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No files available.";
    largestList.append(empty);
    return;
  }

  state.largest.forEach((item) => {
    const row = document.createElement("div");
    row.className = "largest-row";

    const meta = document.createElement("div");
    meta.className = "folder-meta";
    const title = document.createElement("strong");
    title.textContent = itemTitle(item);
    const details = document.createElement("span");
    details.textContent = `${formatBytes(itemSize(item))} · ${itemType(item) === "video" ? "Recording" : "Screenshot"}`;
    meta.append(title, details);

    const actions = document.createElement("div");
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "ghost";
    openBtn.textContent = "Open";
    openBtn.addEventListener("click", () => openMediaItem(item));

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "ghost";
    downloadBtn.textContent = "Download";
    downloadBtn.addEventListener("click", () => downloadItem(item));

    actions.append(openBtn, downloadBtn);
    row.append(meta, actions);
    largestList.append(row);
  });
}

function createContextButton(label, onClick, className = "ghost") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", (event) => {
    Promise.resolve(onClick(event)).catch((error) => {
      console.error(error);
      showToast("Action failed.", true);
    });
  });
  return button;
}

function cardAriaLabel(item) {
  const parts = [itemTitle(item), itemType(item) === "video" ? "Recording" : "Screenshot", formatBytes(itemSize(item))];
  if (item.metadata?.durationMs) {
    parts.push(`Duration ${formatDuration(item.metadata.durationMs)}`);
  }
  if (itemType(item) === "image") {
    const reviewSummary = reviewWorkspaceSummaryForItem(item);
    parts.push(reviewSummary.reviewType);
    parts.push(reviewSummary.findingCountLabel);
    parts.push(reviewSummary.reportStatus);
  }
  parts.push(`Created ${formatDate(item.createdAt)}`);
  return parts.join(". ");
}

async function promptRenameItem(item, invoker) {
  const next = await openInputDialog({
    invoker,
    title: "Rename item",
    description: `Enter a new name for ${itemTitle(item)}.`,
    value: itemTitle(item),
    acceptLabel: "Rename"
  });
  if (!next) return;
  await renameItem(item.id, next);
  showToast("Item renamed.");
  await refresh();
}

async function promptDuplicateItem(item) {
  const blob = await getMediaBlob(item.id);
  if (!(blob instanceof Blob)) {
    showToast("Missing source file.", true);
    return;
  }
  await createItem({
    type: item.type,
    blob,
    folderId: item.folderId,
    metadata: {
      ...item.metadata,
      title: `${itemTitle(item)} Copy`,
      tags: [...itemTags(item)]
    }
  });
  showToast("Item duplicated.");
  await refresh();
}

async function openItemInEditor(item) {
  if (itemType(item) !== "image") {
    showToast("Only screenshots can be edited.", true);
    return;
  }
  const url = chrome.runtime.getURL(`editor.html?itemId=${item.id}`);
  await chrome.tabs.create({ url });
}

async function openItemInReview(item) {
  if (itemType(item) !== "image") {
    showToast("Review Mode supports saved image items only.", true);
    return;
  }
  const url = chrome.runtime.getURL(`review.html?itemId=${encodeURIComponent(item.id)}`);
  await chrome.tabs.create({ url });
}

async function handleDesignReviewImport() {
  const file = designReviewImportInput?.files?.[0] || null;
  if (!file) return;

  try {
    const item = await importDesignScreenshotForReview({
      file,
      createItem,
      openReview: openItemInReview
    });
    showToast(`Imported ${itemTitle(item)} for Design Review.`);
    await refresh();
    setView("reviews");
  } catch (error) {
    console.error(error);
    showToast(String(error?.message || error || "Design import failed."), true);
  } finally {
    if (designReviewImportInput) designReviewImportInput.value = "";
  }
}

async function toggleFavouriteItem(item) {
  const nextFavourite = !item.metadata?.favourite;
  await updateMediaMetadata(item.id, { favourite: nextFavourite });
  showToast(nextFavourite ? "Marked as Kept in Sight." : "Removed from Kept in Sight.");
  await refresh();
}

async function promptUpdateTags(item, invoker) {
  const next = await openInputDialog({
    invoker,
    title: "Update tags",
    description: "Enter comma-separated tags.",
    value: itemTags(item).join(", "),
    acceptLabel: "Apply"
  });
  if (next === null) return;
  await updateMediaMetadata(item.id, { tags: normalizeTagsInput(next) });
  showToast("Tags updated.");
  await refresh();
}

async function clearItemTags(item) {
  await updateMediaMetadata(item.id, { tags: [] });
  showToast("Tags removed.");
  await refresh();
}

async function promptMoveToFolder(item, invoker) {
  const nextFolder = await openInputDialog({
    invoker,
    title: "Move to folder",
    description: "Type target folder name.",
    value: folderName(item.folderId),
    acceptLabel: "Move"
  });
  if (!nextFolder) return;
  let folder = state.folders.find((entry) => entry.name.toLowerCase() === nextFolder.toLowerCase());
  if (!folder) {
    folder = await createFolder(nextFolder);
  }
  await moveItem(item.id, folder.id);
  showToast("Item moved.");
  await refresh();
}

async function moveItemToOutOfSight(item, invoker) {
  const ok = await openConfirmDialog({
    invoker,
    title: "Move out of sight",
    message: "Move this item to Out of Sight? You can restore it later.",
    confirmLabel: "Move"
  });
  if (!ok) return;
  await deleteItem(item.id);
  state.selectedMediaIds.delete(item.id);
  showToast("Item moved to Out of Sight.");
  await refresh();
}

async function restoreTrashEntry(entry) {
  await restoreFromTrash(entry.id);
  state.selectedTrashIds.delete(entry.id);
  showToast("Item restored to sight.");
  await refresh();
}

async function permanentlyDeleteTrashEntry(entry, invoker) {
  const ok = await openConfirmDialog({
    invoker,
    title: "Delete permanently",
    message: "Delete this Out of Sight item permanently from local storage? This cannot be undone.",
    confirmLabel: "Delete"
  });
  if (!ok) return;
  await permanentlyDelete(entry.id);
  state.selectedTrashIds.delete(entry.id);
  showToast("Permanently deleted.");
  await refresh();
}

function getCardView() {
  if (!cardView) {
    cardView = createGalleryCardView({
      state,
      galleryGrid,
      updateSelectionUi,
      cardAriaLabel,
      itemTitle,
      itemSize,
      itemType,
      itemTags,
      folderName,
      formatDate,
      formatBytes,
      formatDuration,
      createContextButton,
      promptRenameItem,
      promptDuplicateItem,
      openItemInEditor,
      openItemInReview,
      openVideoPreview,
      toggleFavouriteItem,
      downloadItem,
      copyImageItem,
      exportScreenshotPdf,
      promptUpdateTags,
      clearItemTags,
      promptMoveToFolder,
      moveItemToOutOfSight,
      restoreTrashEntry,
      permanentlyDeleteTrashEntry,
      openMediaItem,
      showToast
    });
  }
  return cardView;
}

function renderGalleryGrid() {
  galleryGrid.innerHTML = "";

  if (!isMediaCardView()) {
    return;
  }

  if (isTrashView()) {
    const entries = filteredTrashEntries();
    itemCount.textContent = String(entries.length);
    emptyState.hidden = entries.length > 0;
    if (!entries.length) {
      emptyState.innerHTML = "<h3>Out of Sight is empty.</h3><p>Capture what your eye sees.</p><p>Your local library lives only on this browser.</p>";
      return;
    }

    entries.forEach((entry) => {
      galleryGrid.append(getCardView().createTrashCard(entry));
    });

    return;
  }

  const items = filteredMediaItems();
  itemCount.textContent = String(items.length);
  emptyState.hidden = items.length > 0;
  if (!items.length) {
    emptyState.innerHTML = "<h3>Nothing captured yet.</h3><p>Capture what your eye sees.</p><p>Your local library lives only on this browser.</p>";
    return;
  }

  items.forEach((item) => {
    galleryGrid.append(getCardView().createMediaCard(item));
  });
}

async function openMediaItem(item) {
  if (itemType(item) === "image") {
    const url = chrome.runtime.getURL(`editor.html?itemId=${item.id}`);
    await chrome.tabs.create({ url });
    return;
  }

  await openVideoPreview(item);
}

async function openVideoPreview(item) {
  const blob = await getMediaBlob(item.id);
  if (!(blob instanceof Blob)) {
    showToast("Recording source is unavailable.", true);
    return;
  }

  closePreviewDialog();
  previewBlobUrl = URL.createObjectURL(blob);
  previewVideo.src = previewBlobUrl;
  previewVideo.load();
  previewDialog.showModal();
  previewCloseBtn.focus();
}

async function downloadItem(item) {
  const blob = await getMediaBlob(item.id);
  if (!(blob instanceof Blob)) {
    showToast("Missing source file.", true);
    return;
  }

  const ext = item.metadata?.extension || (itemType(item) === "video" ? "webm" : "png");
  await downloadBlob(blob, `Olho/${safeFilename(itemTitle(item))}-${Date.now()}.${ext}`);
  showToast("Download started.");
}

async function copyImageItem(item) {
  const blob = await getMediaBlob(item.id);
  if (!(blob instanceof Blob)) {
    showToast("Missing source file.", true);
    return;
  }

  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    showToast("Clipboard write is unavailable in this environment.", true);
    return;
  }

  await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
  showToast("Image copied to clipboard.");
}

function buildPdfFromJpegBytes(jpegBytes, width, height) {
  const textChunks = [];
  const binaryChunks = [];
  const offsets = [0];
  let offset = 0;

  function pushText(text) {
    const bytes = encoder.encode(text);
    textChunks.push(bytes);
    offset += bytes.length;
  }

  function pushBinary(bytes) {
    binaryChunks.push(bytes);
    offset += bytes.length;
  }

  pushText("%PDF-1.4\n");

  offsets.push(offset);
  pushText("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  offsets.push(offset);
  pushText("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  offsets.push(offset);
  pushText(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  offsets.push(offset);
  pushText(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBinary(jpegBytes);
  pushText("\nendstream\nendobj\n");

  const contentStream = encoder.encode(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`);
  offsets.push(offset);
  pushText(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n`);
  pushBinary(contentStream);
  pushText("\nendstream\nendobj\n");

  const xrefOffset = offset;
  pushText("xref\n0 6\n");
  pushText("0000000000 65535 f \n");
  for (let i = 1; i <= 5; i += 1) {
    const value = String(offsets[i]).padStart(10, "0");
    pushText(`${value} 00000 n \n`);
  }

  pushText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const allChunks = [...textChunks, ...binaryChunks];
  const totalLength = allChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let cursor = 0;
  allChunks.forEach((chunk) => {
    output.set(chunk, cursor);
    cursor += chunk.length;
  });

  return new Blob([output], { type: "application/pdf" });
}

async function exportScreenshotPdf(item) {
  const source = await getMediaBlob(item.id);
  if (!(source instanceof Blob)) {
    showToast("Missing source file.", true);
    return;
  }

  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    showToast("Canvas is unavailable for PDF export.", true);
    return;
  }

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const jpegBlob = await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || null), "image/jpeg", 0.92);
  });

  if (!(jpegBlob instanceof Blob)) {
    showToast("JPEG conversion failed for PDF export.", true);
    return;
  }

  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdfBlob = buildPdfFromJpegBytes(jpegBytes, canvas.width, canvas.height);
  await downloadBlob(pdfBlob, `Olho/${safeFilename(itemTitle(item))}-${Date.now()}.pdf`);
  showToast("PDF export started.");
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

async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs: true
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 15_000);
  }
}

async function downloadItemsAsZip(items, filenamePrefix) {
  if (!items.length) {
    showToast("No items selected.", true);
    return;
  }

  const entries = [];
  for (const item of items) {
    const blob = await getMediaBlob(item.id);
    if (!(blob instanceof Blob)) {
      continue;
    }
    const ext = item.metadata?.extension || (itemType(item) === "video" ? "webm" : "png");
    entries.push({
      name: `${safeFilename(itemTitle(item))}.${ext}`,
      blob
    });
  }

  if (!entries.length) {
    showToast("No file sources were available to export.", true);
    return;
  }

  const zipBlob = await createZipBlob(entries);
  await downloadBlob(zipBlob, `Olho/${filenamePrefix}-${Date.now()}.zip`);
  showToast("ZIP export started.");
}

async function exportMetadataJson(records, filenamePrefix) {
  const payload = {
    exportedAt: new Date().toISOString(),
    count: records.length,
    records
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  await downloadBlob(blob, `Olho/${filenamePrefix}-${Date.now()}.json`);
  showToast("Metadata export started.");
}

function selectedMediaItems() {
  return state.items.filter((item) => state.selectedMediaIds.has(item.id));
}

function selectedTrashEntries() {
  return state.trash.filter((entry) => state.selectedTrashIds.has(entry.id));
}

async function applyBulkMove() {
  const folderId = bulkFolderSelect.value;
  if (!folderId) {
    showToast("Choose a destination folder first.", true);
    return;
  }

  const items = selectedMediaItems();
  if (!items.length) {
    showToast("No items selected.", true);
    return;
  }

  for (const item of items) {
    await moveItem(item.id, folderId);
  }

  showToast("Selected items moved.");
  state.selectedMediaIds.clear();
  await refresh();
}

async function applyBulkTags() {
  const tags = normalizeTagsInput(bulkTagInput.value);
  if (!tags.length) {
    showToast("Enter one or more tags.", true);
    return;
  }

  const items = selectedMediaItems();
  if (!items.length) {
    showToast("No items selected.", true);
    return;
  }

  for (const item of items) {
    const merged = normalizeTagsInput([...itemTags(item), ...tags]);
    await updateMediaMetadata(item.id, { tags: merged });
  }

  showToast("Tags applied to selection.");
  await refresh();
}

async function applyBulkFavourite(favourite) {
  const items = selectedMediaItems();
  if (!items.length) {
    showToast("No items selected.", true);
    return;
  }

  for (const item of items) {
    await updateMediaMetadata(item.id, { favourite });
  }

  showToast(favourite ? "Selection marked as Kept in Sight." : "Selection removed from Kept in Sight.");
  await refresh();
}

async function applyBulkDelete() {
  const items = selectedMediaItems();
  if (!items.length) {
    showToast("No items selected.", true);
    return;
  }

  const ok = await openConfirmDialog({
    invoker: bulkDeleteBtn,
    title: "Move selected out of sight",
    message: `Move ${items.length} selected item(s) to Out of Sight?`,
    confirmLabel: "Move"
  });

  if (!ok) return;

  for (const item of items) {
    await deleteItem(item.id);
  }

  state.selectedMediaIds.clear();
  showToast("Selected items moved to Out of Sight.");
  await refresh();
}

async function applyBulkRestore() {
  const entries = selectedTrashEntries();
  if (!entries.length) {
    showToast("No Out of Sight items selected.", true);
    return;
  }

  for (const entry of entries) {
    await restoreFromTrash(entry.id);
  }

  state.selectedTrashIds.clear();
  showToast("Selected items restored to sight.");
  await refresh();
}

async function applyBulkPermanentDelete() {
  const entries = selectedTrashEntries();
  if (!entries.length) {
    showToast("No Out of Sight items selected.", true);
    return;
  }

  const ok = await openConfirmDialog({
    invoker: bulkPermanentDeleteBtn,
    title: "Delete selected permanently",
    message: `Delete ${entries.length} selected Out of Sight item(s) permanently?`,
    confirmLabel: "Delete"
  });

  if (!ok) return;

  for (const entry of entries) {
    await permanentlyDelete(entry.id);
  }

  state.selectedTrashIds.clear();
  showToast("Selected items permanently deleted.");
  await refresh();
}

async function exportVisibleZip() {
  const items = isTrashView() ? [] : filteredMediaItems();
  await downloadItemsAsZip(items, "olho-visible-export");
}

async function exportSelectedZip() {
  const items = selectedMediaItems();
  await downloadItemsAsZip(items, "olho-selection-export");
}

async function exportSelectedMetadata() {
  if (isTrashView()) {
    await exportMetadataJson(selectedTrashEntries(), "olho-trash-selection-metadata");
  } else {
    await exportMetadataJson(selectedMediaItems(), "olho-selection-metadata");
  }
}

async function exportFullMetadata() {
  const metadata = await exportAllMetadata();
  const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
  await downloadBlob(blob, `Olho/olho-library-metadata-${Date.now()}.json`);
  showToast("Full metadata export started.");
}

async function handleDeleteAllData() {
  const confirmedPhrase = await openInputDialog({
    invoker: deleteAllBtn,
    title: "Delete all local data",
    description: "Type DELETE LOCAL DATA to remove every local capture, recording, draft, folder, and Out of Sight item.",
    value: "",
    acceptLabel: "Delete all"
  });

  if (confirmedPhrase === null) return;

  if (confirmedPhrase !== "DELETE LOCAL DATA") {
    showToast("Confirmation phrase does not match.", true);
    return;
  }

  await clearAllData();
  state.selectedMediaIds.clear();
  state.selectedTrashIds.clear();
  showToast("All local data deleted.");
  await refresh();
}

function openConfirmDialog({ invoker, title, message, confirmLabel }) {
  if (!(confirmDialog instanceof HTMLDialogElement) || typeof confirmDialog.showModal !== "function") {
    return Promise.resolve(window.confirm(message || "Are you sure?"));
  }

  dialogInvoker = invoker || document.activeElement;
  confirmTitle.textContent = title || "Confirm action";
  confirmBody.textContent = message || "Are you sure?";
  confirmAcceptBtn.textContent = confirmLabel || "Confirm";

  return new Promise((resolve) => {
    dialogResolver = resolve;
    confirmDialog.showModal();
    confirmCancelBtn.focus();
  });
}

function resolveConfirmDialog(value) {
  if (dialogResolver) {
    dialogResolver(value);
    dialogResolver = null;
  }

  if (confirmDialog.open) {
    confirmDialog.close();
  }

  if (dialogInvoker instanceof HTMLElement) {
    dialogInvoker.focus();
  }
}

function openInputDialog({ invoker, title, description, value, acceptLabel }) {
  if (!(inputDialog instanceof HTMLDialogElement) || typeof inputDialog.showModal !== "function") {
    const result = window.prompt(description || title || "Enter value", value || "");
    return Promise.resolve(result === null ? null : sanitizeText(result));
  }

  dialogInvoker = invoker || document.activeElement;
  inputDialogTitle.textContent = title || "Update value";
  inputDialogBody.textContent = description || "Enter value.";
  inputDialogField.value = value || "";
  inputDialogAcceptBtn.textContent = acceptLabel || "Apply";

  return new Promise((resolve) => {
    dialogResolver = (approved) => {
      if (!approved) {
        resolve(null);
        return;
      }
      resolve(sanitizeText(inputDialogField.value));
    };

    inputDialog.showModal();
    inputDialogField.focus();
    inputDialogField.select();
  });
}

function resolveInputDialog(approved) {
  if (dialogResolver) {
    dialogResolver(approved);
    dialogResolver = null;
  }

  if (inputDialog.open) {
    inputDialog.close();
  }

  if (dialogInvoker instanceof HTMLElement) {
    dialogInvoker.focus();
  }
}

async function hydrateThumbnails(items) {
  await Promise.all(
    items.map(async (item) => {
      const thumbBlob = await getThumbnailBlob(item.thumbnailId);
      if (thumbBlob instanceof Blob) {
        item.thumbnailUrl = trackObjectUrl(item.id, thumbBlob);
      } else {
        item.thumbnailUrl = "";
      }
      if (!item.metadata?.extension) {
        item.metadata.extension = itemType(item) === "video" ? "webm" : "png";
      }
    })
  );
}

function readFilterInputs() {
  state.filters.query = searchInput.value;
  state.filters.type = typeFilter.value;
  state.filters.folderId = folderFilter.value;
  state.filters.tag = tagFilter.value;
  state.filters.favourite = favouriteFilter.value;
  state.filters.sort = sortSelect.value;
}

function writeFilterInputs() {
  searchInput.value = state.filters.query;
  typeFilter.value = state.filters.type;
  folderFilter.value = state.filters.folderId;
  tagFilter.value = state.filters.tag;
  favouriteFilter.value = state.filters.favourite;
  sortSelect.value = state.filters.sort;
}

function render() {
  writeFilterInputs();

  renderReviewWorkspaceSummary();
  renderFolderFilters();
  renderTagFilter();
  renderFolderList();
  renderTagList();

  if (state.view === "storage") {
    renderStorageStats();
    renderLargestFiles();
  }

  renderGalleryGrid();
  updateSelectionUi();
  updateInspectorPanel();

  const mediaCount = state.view === "trash" ? filteredTrashEntries().length : filteredMediaItems().length;
  itemCount.textContent = String(mediaCount);
}

async function refresh() {
  readFilterInputs();

  const [items, folders, tags, trash, usage, largest, appSettings] = await Promise.all([
    listItems(),
    listFolders(),
    listTags(),
    listTrash(1000),
    getStorageUsage(),
    listLargestMedia(12),
    getAppSettings()
  ]);

  clearObjectUrls();

  state.items = items;
  state.folders = folders;
  state.tags = tags;
  state.trash = trash;
  state.usage = usage;
  state.largest = largest;
  state.appSettings = appSettings;

  await hydrateThumbnails(state.items);

  if (state.view === "folders" && !state.activeFolderId && folders[0]) {
    state.activeFolderId = folders[0].id;
    state.filters.folderId = folders[0].id;
  }

  if (state.view === "tags" && !state.activeTag && tags[0]) {
    state.activeTag = tags[0].name;
    state.filters.tag = tags[0].name;
  }

  state.selectedMediaIds = new Set([...state.selectedMediaIds].filter((id) => state.items.some((item) => item.id === id)));
  state.selectedTrashIds = new Set([...state.selectedTrashIds].filter((id) => state.trash.some((entry) => entry.id === id)));

  render();
}

function bindEvents() {
  viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.view;
      if (!next) return;
      setView(next);
    });
  });

  [searchInput, typeFilter, folderFilter, tagFilter, favouriteFilter, sortSelect].forEach((input) => {
    input.addEventListener("input", () => {
      readFilterInputs();
      render();
    });
    input.addEventListener("change", () => {
      readFilterInputs();
      render();
    });
  });

  refreshBtn.addEventListener("click", () => {
    refresh().catch((error) => {
      console.error(error);
      showToast("Refresh failed.", true);
    });
  });
  importDesignReviewBtn?.addEventListener("click", () => {
    designReviewImportInput?.click();
  });
  designReviewImportInput?.addEventListener("change", () => {
    handleDesignReviewImport().catch((error) => {
      console.error(error);
      showToast("Design import failed.", true);
    });
  });

  createFolderBtn.addEventListener("click", async () => {
    const name = sanitizeText(newFolderName.value);
    if (!name) {
      showToast("Enter a folder name.", true);
      return;
    }

    try {
      await createFolder(name);
      newFolderName.value = "";
      showToast("Folder created.");
      await refresh();
    } catch (error) {
      console.error(error);
      showToast("Folder creation failed.", true);
    }
  });

  selectAllToggle.addEventListener("change", () => {
    if (isTrashView()) {
      if (selectAllToggle.checked) {
        visibleTrashIds().forEach((id) => state.selectedTrashIds.add(id));
      } else {
        visibleTrashIds().forEach((id) => state.selectedTrashIds.delete(id));
      }
    } else {
      if (selectAllToggle.checked) {
        visibleMediaIds().forEach((id) => state.selectedMediaIds.add(id));
      } else {
        visibleMediaIds().forEach((id) => state.selectedMediaIds.delete(id));
      }
    }
    render();
  });

  bulkClearSelectionBtn.addEventListener("click", () => {
    state.selectedMediaIds.clear();
    state.selectedTrashIds.clear();
    render();
  });

  bulkMoveBtn.addEventListener("click", () => applyBulkMove().catch((error) => {
    console.error(error);
    showToast("Bulk move failed.", true);
  }));

  bulkTagBtn.addEventListener("click", () => applyBulkTags().catch((error) => {
    console.error(error);
    showToast("Bulk tags failed.", true);
  }));

  bulkFavouriteBtn.addEventListener("click", () => applyBulkFavourite(true).catch((error) => {
    console.error(error);
    showToast("Bulk Kept in Sight update failed.", true);
  }));

  bulkUnfavouriteBtn.addEventListener("click", () => applyBulkFavourite(false).catch((error) => {
    console.error(error);
    showToast("Bulk sight mark removal failed.", true);
  }));

  bulkDeleteBtn.addEventListener("click", () => applyBulkDelete().catch((error) => {
    console.error(error);
    showToast("Bulk delete failed.", true);
  }));

  bulkRestoreBtn.addEventListener("click", () => applyBulkRestore().catch((error) => {
    console.error(error);
    showToast("Bulk restore failed.", true);
  }));

  bulkPermanentDeleteBtn.addEventListener("click", () => applyBulkPermanentDelete().catch((error) => {
    console.error(error);
    showToast("Bulk permanent delete failed.", true);
  }));

  bulkZipBtn.addEventListener("click", () => exportSelectedZip().catch((error) => {
    console.error(error);
    showToast("ZIP export failed.", true);
  }));

  bulkMetadataBtn.addEventListener("click", () => exportSelectedMetadata().catch((error) => {
    console.error(error);
    showToast("Metadata export failed.", true);
  }));

  exportBeforeDeleteBtn.addEventListener("click", () => exportFullMetadata().catch((error) => {
    console.error(error);
    showToast("Metadata export failed.", true);
  }));

  deleteAllBtn.addEventListener("click", () => handleDeleteAllData().catch((error) => {
    console.error(error);
    showToast("Delete all failed.", true);
  }));

  inspectorOpenBtn?.addEventListener("click", () => {
    const selected = selectedInspectorItem();
    if (!selected || isTrashView()) return;
    openMediaItem(selected).catch((error) => {
      console.error(error);
      showToast("Open failed.", true);
    });
  });

  inspectorReviewBtn?.addEventListener("click", () => {
    const selected = selectedInspectorItem();
    if (!selected || isTrashView()) return;
    openItemInReview(selected).catch((error) => {
      console.error(error);
      showToast("Review Mode failed to open.", true);
    });
  });

  inspectorRenameBtn?.addEventListener("click", () => {
    const selected = selectedInspectorItem();
    if (!selected || isTrashView()) return;
    promptRenameItem(selected, inspectorRenameBtn).catch((error) => {
      console.error(error);
      showToast("Rename failed.", true);
    });
  });

  inspectorFavouriteBtn?.addEventListener("click", () => {
    const selected = selectedInspectorItem();
    if (!selected || isTrashView()) return;
    toggleFavouriteItem(selected).catch((error) => {
      console.error(error);
      showToast("Sight mark update failed.", true);
    });
  });

  inspectorTagsBtn?.addEventListener("click", () => {
    const selected = selectedInspectorItem();
    if (!selected || isTrashView()) return;
    promptUpdateTags(selected, inspectorTagsBtn).catch((error) => {
      console.error(error);
      showToast("Tag update failed.", true);
    });
  });

  inspectorMoveBtn?.addEventListener("click", () => {
    const selected = selectedInspectorItem();
    if (!selected || isTrashView()) return;
    promptMoveToFolder(selected, inspectorMoveBtn).catch((error) => {
      console.error(error);
      showToast("Move failed.", true);
    });
  });

  inspectorDeleteBtn?.addEventListener("click", () => {
    const selected = selectedInspectorItem();
    if (!selected || isTrashView()) return;
    moveItemToOutOfSight(selected, inspectorDeleteBtn).catch((error) => {
      console.error(error);
      showToast("Move out of sight failed.", true);
    });
  });

  inspectorRestoreBtn?.addEventListener("click", () => {
    const selected = selectedInspectorItem();
    if (!selected || !isTrashView()) return;
    restoreTrashEntry(selected).catch((error) => {
      console.error(error);
      showToast("Restore failed.", true);
    });
  });

  inspectorPermanentDeleteBtn?.addEventListener("click", () => {
    const selected = selectedInspectorItem();
    if (!selected || !isTrashView()) return;
    permanentlyDeleteTrashEntry(selected, inspectorPermanentDeleteBtn).catch((error) => {
      console.error(error);
      showToast("Permanent delete failed.", true);
    });
  });

  confirmCancelBtn.addEventListener("click", () => resolveConfirmDialog(false));
  confirmAcceptBtn.addEventListener("click", () => resolveConfirmDialog(true));
  confirmDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveConfirmDialog(false);
  });

  inputDialogCancelBtn.addEventListener("click", () => resolveInputDialog(false));
  inputDialogAcceptBtn.addEventListener("click", () => resolveInputDialog(true));
  inputDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveInputDialog(false);
  });

  previewCloseBtn.addEventListener("click", () => {
    previewDialog.close();
  });
  previewDialog.addEventListener("close", closePreviewDialog);

  window.addEventListener("beforeunload", () => {
    clearObjectUrls();
    closePreviewDialog();
  });
}

bindEvents();
setView("all");
refresh().catch((error) => {
  console.error(error);
  showToast("Gallery failed to load.", true);
});
