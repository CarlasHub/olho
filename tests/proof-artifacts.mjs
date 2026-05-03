import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "test-results", "core-proof-evidence.json");

async function readCurrent() {
  try {
    const text = await fs.readFile(outPath, "utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // no-op
  }
  return {
    generatedAt: new Date().toISOString(),
    captureTab: {},
    selectAreaTab: {},
    screenWindowStill: {},
    recording: {},
    editorOutput: {},
    exportOutput: {},
    runtimeNetwork: {},
    fullPage: {},
    manualRequired: {
      screenWindowNativePicker: true,
      recordingHardwareAudioVideo: true,
      externalMonitor: true,
      nativeAppWindow: true,
      extensionPanelThroughPicker: true,
      webcamVisualConfirmation: true
    }
  };
}

export async function updateCoreProof(mutator) {
  const current = await readCurrent();
  const next = typeof mutator === "function" ? await mutator(current) : current;
  const payload = {
    ...next,
    generatedAt: new Date().toISOString()
  };
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export async function readCoreProof() {
  return readCurrent();
}

export { outPath as coreProofPath };
