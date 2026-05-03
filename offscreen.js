function waitForVideoFrame(video, seekToMs = 200) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while loading video frame."));
    }, 5000);

    function cleanup() {
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    }

    function onError() {
      cleanup();
      reject(new Error("Unable to decode video in offscreen document."));
    }

    function onSeeked() {
      cleanup();
      resolve();
    }

    function onLoadedData() {
      const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
      const target = durationMs > 0 ? Math.min(seekToMs, Math.max(0, durationMs - 20)) / 1000 : 0;
      if (target <= 0) {
        cleanup();
        resolve();
        return;
      }
      video.currentTime = target;
    }

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
  });
}

function drawPosterLabel(ctx, size) {
  ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
  ctx.fillRect(8, size - 36, size - 16, 24);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 12px system-ui";
  ctx.fillText("REC", 16, size - 19);
}

function drawFitted(sourceWidth, sourceHeight, targetSize) {
  const ratio = Math.min(targetSize / sourceWidth, targetSize / sourceHeight);
  const drawWidth = Math.max(1, Math.round(sourceWidth * ratio));
  const drawHeight = Math.max(1, Math.round(sourceHeight * ratio));
  const x = Math.round((targetSize - drawWidth) / 2);
  const y = Math.round((targetSize - drawHeight) / 2);
  return { x, y, drawWidth, drawHeight };
}

async function generateVideoThumbnail(blob, size = 320) {
  if (!(blob instanceof Blob)) {
    throw new Error("Video blob is required.");
  }

  const targetSize = Math.max(96, Math.min(640, Number(size) || 320));
  const video = document.createElement("video");
  const url = URL.createObjectURL(blob);

  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;

  try {
    await waitForVideoFrame(video);

    const sourceWidth = Math.max(1, video.videoWidth || targetSize);
    const sourceHeight = Math.max(1, video.videoHeight || targetSize);

    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not obtain 2d context.");
    }

    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, targetSize, targetSize);

    const fit = drawFitted(sourceWidth, sourceHeight, targetSize);
    ctx.drawImage(video, fit.x, fit.y, fit.drawWidth, fit.drawHeight);
    drawPosterLabel(ctx, targetSize);

    const dataUrl = canvas.toDataURL("image/webp", 0.82);

    return {
      dataUrl,
      width: targetSize,
      height: targetSize,
      mimeType: "image/webp"
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "offscreen") {
    return;
  }

  if (message.type !== "offscreen_thumbnail_generate") {
    return;
  }

  generateVideoThumbnail(message.payload?.blob, message.payload?.size)
    .then((thumbnail) => sendResponse({ ok: true, thumbnail }))
    .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));

  return true;
});
