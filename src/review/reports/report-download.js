function safeFilePart(value) {
  return String(value || "review-report")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "review-report";
}

export function reviewReportFilename(session = {}, extension = "txt") {
  const title = safeFilePart(session.title || session.itemId || "olho-review");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${title}-${stamp}.${extension}`;
}

export function downloadTextReport({ text, filename, mimeType }) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
