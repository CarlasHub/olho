import { isReviewWorkspaceItem, reviewWorkspaceSummaryForItem } from "./review-workspace-summary.js";

export function createGalleryCardView(deps) {
  const {
    state,
    galleryGrid,
    updateSelectionUi,
    cardAriaLabel,
    itemTitle,
    itemSize,
    itemType,
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
    showToast,
    promptUpdateTags,
    clearItemTags,
    promptMoveToFolder,
    moveItemToOutOfSight,
    restoreTrashEntry,
    permanentlyDeleteTrashEntry,
    openMediaItem
  } = deps;

  function onCardKeydown(event, id, trash) {
    const cards = Array.from(galleryGrid.querySelectorAll(".gallery-card"));
    const currentIndex = cards.findIndex((entry) => entry.dataset.itemId === id);
    const columns = Math.max(1, Math.round(galleryGrid.clientWidth / 280));

    if (event.key === "Enter") {
      event.preventDefault();
      if (!trash) {
        const item = state.items.find((entry) => entry.id === id);
        if (item) {
          openMediaItem(item);
        }
      }
    }

    if (event.key === " ") {
      event.preventDefault();
      if (trash) {
        if (state.selectedTrashIds.has(id)) {
          state.selectedTrashIds.delete(id);
        } else {
          state.selectedTrashIds.add(id);
        }
      } else if (state.selectedMediaIds.has(id)) {
        state.selectedMediaIds.delete(id);
      } else {
        state.selectedMediaIds.add(id);
      }
      updateSelectionUi();
      return;
    }

    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = Math.min(cards.length - 1, currentIndex + 1);
    if (event.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
    if (event.key === "ArrowDown") nextIndex = Math.min(cards.length - 1, currentIndex + columns);
    if (event.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - columns);

    if (nextIndex !== currentIndex) {
      event.preventDefault();
      cards[nextIndex]?.focus();
    }
  }

  function createMediaCard(item) {
    const reviewSummary = reviewWorkspaceSummaryForItem(item);
    const card = document.createElement("article");
    card.className = "gallery-card";
    card.dataset.card = "true";
    card.dataset.itemId = item.id;
    if (reviewSummary.isReviewable) {
      card.dataset.reviewStatus = reviewSummary.statusLabel;
    }
    card.tabIndex = 0;
    card.setAttribute("role", "gridcell");
    card.setAttribute("aria-label", cardAriaLabel(item));
    card.classList.toggle("is-selected", state.selectedMediaIds.has(item.id));
    card.classList.toggle("review-workspace-card", isReviewWorkspaceItem(item));

    const top = document.createElement("div");
    top.className = "card-top";

    const selectWrap = document.createElement("label");
    selectWrap.className = "checkbox-wrap card-select-toggle";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = state.selectedMediaIds.has(item.id);
    check.setAttribute("aria-label", `Select ${itemTitle(item)}`);
    check.addEventListener("change", () => {
      if (check.checked) {
        state.selectedMediaIds.add(item.id);
      } else {
        state.selectedMediaIds.delete(item.id);
      }
      updateSelectionUi();
    });
    const checkText = document.createElement("span");
    checkText.textContent = "Select";
    checkText.className = "sr-only";
    selectWrap.append(check, checkText);
    top.append(selectWrap);

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "gallery-thumb-wrap";
    const thumb = document.createElement(itemType(item) === "video" ? "video" : "img");
    thumb.className = "gallery-thumb";
    thumb.src = item.thumbnailUrl || "";
    thumb.alt = itemTitle(item);
    if (itemType(item) === "video") {
      thumb.muted = true;
      thumb.playsInline = true;
      thumb.loop = true;
      thumb.autoplay = true;
    }
    thumb.addEventListener("error", () => {
      thumb.classList.add("missing");
      thumb.removeAttribute("src");
    });
    thumbWrap.append(thumb);

    const title = document.createElement("p");
    title.className = "card-title";
    title.textContent = itemTitle(item);

    const badgeRow = document.createElement("div");
    badgeRow.className = "card-badges";
    const typeChip = document.createElement("span");
    typeChip.className = "type-chip";
    typeChip.textContent = itemType(item) === "video" ? "Recording" : "Screenshot";
    badgeRow.append(typeChip);
    if (reviewSummary.isReviewable) {
      const reviewTypeChip = document.createElement("span");
      reviewTypeChip.className = "review-type-chip";
      reviewTypeChip.textContent = reviewSummary.reviewType;
      badgeRow.append(reviewTypeChip);

      const sourceChip = document.createElement("span");
      sourceChip.className = "review-source-chip";
      sourceChip.textContent = reviewSummary.sourceLabel;
      badgeRow.append(sourceChip);
    }
    if (item.metadata?.favourite) {
      const sightChip = document.createElement("span");
      sightChip.className = "favourite-chip";
      sightChip.textContent = "Kept in Sight";
      badgeRow.append(sightChip);
    }

    const reviewPanel = document.createElement("div");
    reviewPanel.className = "card-review-summary";
    if (reviewSummary.isReviewable) {
      [
        ["Findings", reviewSummary.findingCountLabel],
        ["Severity", reviewSummary.severityText],
        ["Report", reviewSummary.reportStatus]
      ].forEach(([label, value]) => {
        const row = document.createElement("p");
        row.className = "review-summary-row";
        const rowLabel = document.createElement("span");
        rowLabel.textContent = label;
        const rowValue = document.createElement("strong");
        rowValue.textContent = value;
        row.append(rowLabel, rowValue);
        reviewPanel.append(row);
      });
    }

    const meta = document.createElement("p");
    meta.className = "card-meta";
    const metaParts = [formatDate(item.createdAt), formatBytes(itemSize(item))];
    if (itemType(item) === "video" && item.metadata?.durationMs) {
      metaParts.push(formatDuration(item.metadata.durationMs));
    }
    meta.textContent = metaParts.join(" · ");

    const actions = document.createElement("div");
    actions.className = "card-actions";
    actions.append(createContextButton("Open", () => openMediaItem(item)));

    const menu = document.createElement("details");
    menu.className = "context-menu";
    const summary = document.createElement("summary");
    summary.className = "ghost";
    summary.textContent = "More";
    summary.setAttribute("role", "button");
    summary.setAttribute("aria-label", `More actions for ${itemTitle(item)}`);

    const menuActions = document.createElement("div");
    menuActions.className = "context-actions";

    const reviewActions = [];
    if (itemType(item) === "image") {
      reviewActions.push(createContextButton("Open in Review Mode", () => openItemInReview(item)));
    }

    menuActions.append(
      createContextButton("Rename", () => promptRenameItem(item, summary)),
      createContextButton("Duplicate", () => promptDuplicateItem(item)),
      createContextButton("Edit Screenshot", () => openItemInEditor(item)),
      ...reviewActions,
      createContextButton("Preview Video", async () => {
        if (itemType(item) !== "video") {
          showToast("Only recordings support preview.", true);
          return;
        }
        await openVideoPreview(item);
      }),
      createContextButton(
        item.metadata?.favourite ? "Remove Sight Mark" : "Keep in Sight",
        () => toggleFavouriteItem(item)
      ),
      createContextButton("Download", () => downloadItem(item)),
      createContextButton("Copy Image", async () => {
        if (itemType(item) !== "image") {
          showToast("Copy image is available for screenshots only.", true);
          return;
        }
        await copyImageItem(item);
      }),
      createContextButton("Export PDF", async () => {
        if (itemType(item) !== "image") {
          showToast("PDF export is available for screenshots only.", true);
          return;
        }
        await exportScreenshotPdf(item);
      }),
      createContextButton("Add/Replace Tags", () => promptUpdateTags(item, summary)),
      createContextButton("Remove Tags", () => clearItemTags(item)),
      createContextButton("Move to Folder", () => promptMoveToFolder(item, summary)),
      createContextButton("Move Out of Sight", () => moveItemToOutOfSight(item, summary), "danger")
    );

    menu.append(summary, menuActions);
    actions.append(menu);

    card.addEventListener("keydown", (event) => onCardKeydown(event, item.id, false));
    if (reviewSummary.isReviewable) {
      card.append(top, thumbWrap, title, badgeRow, reviewPanel, meta, actions);
    } else {
      card.append(top, thumbWrap, title, badgeRow, meta, actions);
    }
    return card;
  }

  function createTrashCard(entry) {
    const card = document.createElement("article");
    card.className = "gallery-card";
    card.dataset.card = "true";
    card.dataset.itemId = entry.id;
    card.tabIndex = 0;
    card.setAttribute("role", "gridcell");
    card.setAttribute("aria-label", `${entry.title || "Untitled"}. Deleted ${formatDate(entry.deletedAt)}.`);
    card.classList.toggle("is-selected", state.selectedTrashIds.has(entry.id));

    const top = document.createElement("div");
    top.className = "card-top";

    const selectWrap = document.createElement("label");
    selectWrap.className = "checkbox-wrap";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = state.selectedTrashIds.has(entry.id);
    check.setAttribute("aria-label", `Select Out of Sight item ${entry.title || "Untitled"}`);
    check.addEventListener("change", () => {
      if (check.checked) {
        state.selectedTrashIds.add(entry.id);
      } else {
        state.selectedTrashIds.delete(entry.id);
      }
      updateSelectionUi();
    });
    const label = document.createElement("span");
    label.textContent = "Select";
    selectWrap.append(check, label);

    const typeChip = document.createElement("span");
    typeChip.className = "type-chip";
    typeChip.textContent = "Out of Sight";

    top.append(selectWrap, typeChip);

    const title = document.createElement("p");
    title.className = "card-title";
    title.textContent = entry.title || "Untitled";

    const meta = document.createElement("p");
    meta.className = "card-meta";
    meta.textContent = `Deleted ${formatDate(entry.deletedAt)}`;

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const restoreBtn = createContextButton("Restore", () => restoreTrashEntry(entry));
    const deleteBtn = createContextButton(
      "Delete Permanently",
      () => permanentlyDeleteTrashEntry(entry, deleteBtn),
      "danger"
    );
    actions.append(restoreBtn, deleteBtn);

    card.addEventListener("keydown", (event) => onCardKeydown(event, entry.id, true));
    card.append(top, title, meta, actions);
    return card;
  }

  return {
    createMediaCard,
    createTrashCard,
    onCardKeydown
  };
}
