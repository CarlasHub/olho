export function detectLocalOpenCvRuntime(runtime = globalThis.cv) {
  const available = Boolean(runtime && typeof runtime === "object");
  return {
    available,
    provider: available ? "opencv-js-local" : "",
    reason: available
      ? "Local OpenCV runtime detected. The deterministic Canvas pipeline remains the default analyser."
      : "Local OpenCV runtime is not bundled. Canvas/ImageData analysis is active."
  };
}

export function createOpenCvAdapter(runtime = globalThis.cv) {
  const detected = detectLocalOpenCvRuntime(runtime);
  return {
    ...detected,
    analyse() {
      return {
        available: detected.available,
        provider: detected.provider,
        observations: [],
        reason: detected.available
          ? "OpenCV adapter boundary is available for future local image-processing kernels."
          : detected.reason
      };
    }
  };
}
