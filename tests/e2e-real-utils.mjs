import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const root = path.resolve(__dirname, "..");
export const buildDir = path.join(root, "dist", "build");

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isExecutableCommand(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return result.status === 0;
}

export async function resolveChromeBinary() {
  if (process.env.CHROME_BIN) {
    return process.env.CHROME_BIN;
  }

  const home = process.env.HOME || "";
  const chromeForTestingCandidates = [
    path.join(
      home,
      "Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    ),
    "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
  ];
  for (const candidate of chromeForTestingCandidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  const macPath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (await pathExists(macPath)) {
    return macPath;
  }

  const candidates = ["google-chrome", "chromium", "chrome"];
  for (const candidate of candidates) {
    if (isExecutableCommand(candidate)) {
      return candidate;
    }
  }

  throw new Error("Chrome binary not found. Set CHROME_BIN to run real extension e2e tests.");
}

export function runBuild() {
  const result = spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd: root,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    throw new Error(`build failed:\n${output}`);
  }
}

function createTelemetry(label) {
  return {
    label,
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    requests: []
  };
}

function attachTelemetry(page, telemetry) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      telemetry.consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    telemetry.pageErrors.push(String(error?.stack || error?.message || error));
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure();
    telemetry.requestFailures.push({
      url: request.url(),
      method: request.method(),
      reason: failure?.errorText || "request_failed"
    });
  });

  page.on("request", (request) => {
    telemetry.requests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType()
    });
  });
}

async function terminateProcess(proc) {
  if (!proc) return;
  if (proc.exitCode !== null || proc.signalCode) return;
  proc.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => proc.once("exit", () => resolve())),
    delay(1000)
  ]);
  if (proc.exitCode === null && !proc.signalCode) {
    proc.kill("SIGKILL");
    await Promise.race([
      new Promise((resolve) => proc.once("exit", () => resolve())),
      delay(1000)
    ]);
  }
}

function cleanupOrphanExtensionBrowsers() {
  const markerA = `--disable-extensions-except=${buildDir}`;
  const markerB = "olho-real-e2e-";
  const result = spawnSync("ps", ["-axo", "pid=,command="], {
    encoding: "utf8"
  });
  if (result.status !== 0) return;

  const lines = String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const command = match[2];
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    if (!command.includes(markerA) && !command.includes(markerB)) continue;
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // best effort cleanup
    }
  }
}

async function writeFailureArtifacts(context, reason) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = slugify(context.name || "e2e");
  const artifactDir = path.join(root, "dist", "e2e-artifacts", `${stamp}-${baseName}`);
  await fs.mkdir(artifactDir, { recursive: true });

  const summary = {
    testName: context.name,
    extensionId: context.extensionId || null,
    reason: String(reason?.stack || reason?.message || reason || "unknown"),
    pages: context.telemetry
  };
  await fs.writeFile(path.join(artifactDir, "summary.json"), JSON.stringify(summary, null, 2));

  for (const entry of context.pages) {
    const label = slugify(entry.label || "page");
    try {
      await entry.page.screenshot({
        path: path.join(artifactDir, `${label}.png`),
        fullPage: true
      });
    } catch {
      // best effort
    }
    try {
      const html = await entry.page.content();
      await fs.writeFile(path.join(artifactDir, `${label}.html`), html, "utf8");
    } catch {
      // best effort
    }
  }

  return artifactDir;
}

async function resolveExtensionId(browser, timeoutMs = 25_000) {
  const start = Date.now();
  const seenUrls = new Set();

  while (Date.now() - start < timeoutMs) {
    const targets = browser.targets();
    const ids = new Set();
    for (const target of targets) {
      const url = String(target.url() || "");
      if (url) {
        seenUrls.add(url);
      }
      const match = url.match(/^chrome-extension:\/\/([a-z]{32})\//i);
      if (match) {
        ids.add(match[1]);
      }
    }

    for (const id of ids) {
      let probePage = null;
      try {
        probePage = await browser.newPage();
        await probePage.goto(`chrome-extension://${id}/popup.html`, {
          waitUntil: "domcontentloaded",
          timeout: 7_000
        });
        const probe = await probePage.evaluate(() => ({
          errorCode: document.querySelector(".error-code")?.textContent?.trim() || "",
          hasCaptureButton: Boolean(document.querySelector('button[data-action="capture-visible"]'))
        }));
        if (probe?.hasCaptureButton && !probe?.errorCode) {
          await probePage.close();
          return id;
        }
      } catch {
        // Continue probing next candidate extension id.
      } finally {
        if (probePage && !probePage.isClosed()) {
          await probePage.close().catch(() => {});
        }
      }
    }

    for (const target of targets) {
      const url = String(target.url() || "");
      const match = url.match(
        /^chrome-extension:\/\/([a-z]{32})\/(popup\.html|editor\.html|gallery\.html|options\.html|record\.html|export-report\.html)/i
      );
      if (match) {
        return match[1];
      }
    }

    await delay(120);
  }

  const urls = Array.from(seenUrls).sort();
  throw new Error(
    `Could not resolve extension id from browser targets.\nObserved targets:\n${urls.map((url) => `- ${url}`).join("\n")}`
  );
}

export async function getExtensionId(browser, timeoutMs = 25_000) {
  return resolveExtensionId(browser, timeoutMs);
}

async function assertNotChromeErrorPage(page, relPath) {
  const state = await page.evaluate(() => ({
    href: location.href,
    title: document.title || "",
    errorCode: document.querySelector(".error-code")?.textContent?.trim() || ""
  }));
  if (state.errorCode) {
    throw new Error(`Extension page ${relPath} failed to load (${state.errorCode}) at ${state.href}`);
  }
}

export async function withRealExtension(name, task) {
  runBuild();
  cleanupOrphanExtensionBrowsers();

  const chromeBinary = await resolveChromeBinary();
  const { browser, chromeProc, userDataDir } = await startChromeSession(chromeBinary);

  const context = {
    name,
    extensionId: "",
    pages: [],
    telemetry: []
  };

  async function openPage(relPath, label = relPath) {
    const page = await browser.newPage();
    const telemetry = createTelemetry(label);
    attachTelemetry(page, telemetry);
    await page.goto(`chrome-extension://${context.extensionId}/${relPath}`, {
      waitUntil: "load",
      timeout: 20_000
    });
    await page.waitForFunction(() => document.readyState === "complete", { timeout: 15_000 });
    await assertNotChromeErrorPage(page, relPath);
    context.pages.push({ page, label, telemetry });
    context.telemetry.push(telemetry);
    return { page, telemetry };
  }

  try {
    context.extensionId = await resolveExtensionId(browser);
    assert.match(context.extensionId, /^[a-z]{32}$/);

    await task({
      browser,
      extensionId: context.extensionId,
      openPage
    });
  } catch (error) {
    const artifactDir = await writeFailureArtifacts(context, error);
    throw new Error(
      `${String(error?.message || error)}\nFailure artifacts: ${path.relative(root, artifactDir)}`
    );
  } finally {
    try {
      await browser.disconnect();
    } catch {
      // best effort
    }
    await terminateProcess(chromeProc).catch(() => {});
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    cleanupOrphanExtensionBrowsers();
  }
}

export function assertNoPageErrors(telemetry, pageName) {
  assert.deepEqual(
    telemetry.pageErrors,
    [],
    `${pageName} page errors:\n${telemetry.pageErrors.join("\n")}`
  );
  assert.deepEqual(
    telemetry.consoleErrors,
    [],
    `${pageName} console errors:\n${telemetry.consoleErrors.join("\n")}`
  );
}

export function assertNoUnexpectedOutboundRequests(telemetry, pageName, options = {}) {
  const {
    allowHttpHosts = new Set(),
    allowSchemes = new Set(["chrome-extension:", "data:", "blob:", "about:"])
  } = options;

  const unexpected = [];
  for (const request of telemetry.requests || []) {
    const raw = String(request?.url || "").trim();
    if (!raw) continue;
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }

    const protocol = String(parsed.protocol || "");
    if (allowSchemes.has(protocol)) {
      continue;
    }

    if (protocol === "http:" || protocol === "https:") {
      const host = String(parsed.host || "").toLowerCase();
      if (allowHttpHosts.has(host)) {
        continue;
      }
    }

    unexpected.push({
      url: raw,
      method: request.method || "",
      resourceType: request.resourceType || ""
    });
  }

  assert.deepEqual(
    unexpected,
    [],
    `${pageName} unexpected outbound requests:\n${unexpected
      .map((row) => `${row.method} ${row.resourceType} ${row.url}`)
      .join("\n")}`
  );
}

export async function launchExtension(name = "real-extension-session") {
  runBuild();
  cleanupOrphanExtensionBrowsers();

  const chromeBinary = await resolveChromeBinary();
  const { browser, chromeProc, userDataDir } = await startChromeSession(chromeBinary);

  const context = {
    name,
    extensionId: "",
    pages: [],
    telemetry: []
  };

  context.extensionId = await resolveExtensionId(browser);
  assert.match(context.extensionId, /^[a-z]{32}$/);

  async function openExtensionPage(relPath, label = relPath) {
    const page = await browser.newPage();
    const telemetry = createTelemetry(label);
    attachTelemetry(page, telemetry);
    await page.goto(`chrome-extension://${context.extensionId}/${relPath}`, {
      waitUntil: "load",
      timeout: 20_000
    });
    await page.waitForFunction(() => document.readyState === "complete", { timeout: 15_000 });
    await assertNotChromeErrorPage(page, relPath);
    context.pages.push({ page, label, telemetry });
    context.telemetry.push(telemetry);
    return { page, telemetry };
  }

  async function close() {
    try {
      await browser.disconnect();
    } catch {
      // best effort
    }
    await terminateProcess(chromeProc).catch(() => {});
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    cleanupOrphanExtensionBrowsers();
  }

  return {
    browser,
    extensionId: context.extensionId,
    context,
    openExtensionPage,
    openPopupPage(label = "popup") {
      return openExtensionPage("popup.html", label);
    },
    async screenshotOnFailure(error) {
      const artifactDir = await writeFailureArtifacts(context, error);
      return artifactDir;
    },
    close
  };
}

export async function openExtensionPage(session, relPath, label = relPath) {
  return session.openExtensionPage(relPath, label);
}

export async function openPopupPage(session, label = "popup") {
  return session.openPopupPage(label);
}

export async function openFixturePage(session, fixtureServer, name, label = name) {
  const page = await session.browser.newPage();
  const telemetry = createTelemetry(label);
  attachTelemetry(page, telemetry);
  await page.goto(fixtureServer.urlFor(name), { waitUntil: "load", timeout: 20_000 });
  await page.waitForFunction(() => document.readyState === "complete", { timeout: 15_000 });
  session.context.pages.push({ page, label, telemetry });
  session.context.telemetry.push(telemetry);
  return { page, telemetry };
}

export function waitForNoConsoleErrors(telemetry, pageName) {
  assertNoPageErrors(telemetry, pageName);
}

export async function clickAndExpect(page, selector, expectation, timeout = 10_000) {
  await page.waitForSelector(selector, { timeout });
  await page.click(selector);
  if (typeof expectation === "function") {
    await expectation();
    return;
  }
  if (expectation) {
    await page.waitForFunction(expectation, { timeout });
  }
}

export async function expectVisible(page, selector, timeout = 10_000) {
  await page.waitForSelector(selector, { visible: true, timeout });
}

export async function expectEnabled(page, selector, timeout = 10_000) {
  await page.waitForSelector(selector, { timeout });
  const enabled = await page.$eval(selector, (node) => !(node instanceof HTMLButtonElement || node instanceof HTMLInputElement || node instanceof HTMLSelectElement) || !node.disabled);
  assert.equal(enabled, true, `${selector} must be enabled`);
}

export async function expectAccessibleName(page, selector, timeout = 10_000) {
  await page.waitForSelector(selector, { timeout });
  const name = await page.$eval(selector, (node) => {
    const labelledBy = node.getAttribute("aria-labelledby");
    if (labelledBy) {
      return labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ")
        .trim();
    }
    return (
      node.getAttribute("aria-label") ||
      node.textContent ||
      node.getAttribute("title") ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
  });
  assert.ok(name.length > 0, `${selector} is missing an accessible name`);
}

export async function seedMediaBlobInExtensionContext(page, options = {}) {
  return page.evaluate(async (input) => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
    const pngBase64 =
      input.base64 ||
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+4QYAAAAASUVORK5CYII=";
    const bytes = Uint8Array.from(atob(pngBase64), (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: input.mimeType || "image/png" });
    const saved = await storage.saveMedia({
      kind: input.kind || "screenshot",
      sourceType: input.sourceType || "visible",
      blob,
      metadata: {
        title: input.title || "E2E Seed Media",
        tags: Array.isArray(input.tags) ? input.tags : ["e2e"]
      }
    });
    return saved.id;
  }, options);
}

export async function readMediaFromExtensionContext(page, itemId) {
  return page.evaluate(async (id) => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
    const item = await storage.getMedia(id, { includeBlob: true });
    return {
      id: item?.id || "",
      kind: item?.kind || "",
      type: item?.type || "",
      mimeType: item?.blob?.type || item?.metadata?.mimeType || "",
      sizeBytes: item?.blob?.size || 0
    };
  }, itemId);
}

export async function cleanupExtensionStorage(page) {
  await page.evaluate(async () => {
    const storage = await import(chrome.runtime.getURL("src/storage/storage.js"));
    await storage.clearAllData();
  });
}

export async function screenshotOnFailure(session, error) {
  return session.screenshotOnFailure(error);
}

export function onePixelPngBase64() {
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+4QYAAAAASUVORK5CYII=";
}

async function startChromeSession(chromeBinary) {
  const forceHeaded = process.env.OLHO_E2E_HEADED === "1";
  const forceHeadless = process.env.OLHO_E2E_HEADLESS === "1";
  const useHeadless = forceHeadless || !forceHeaded;
  const errors = [];
  const launchVariants = [
    { label: "default", noSandbox: true, disableGpu: true },
    { label: "compat-no-sandbox-flag-removed", noSandbox: false, disableGpu: true },
    { label: "compat-gpu-enabled", noSandbox: false, disableGpu: false }
  ];

  const parseEnvInt = (name) => {
    const raw = process.env[name];
    if (raw === undefined || raw === "") {
      return null;
    }
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid ${name} value "${raw}". Expected an integer.`);
    }
    return value;
  };

  let windowArgs = [];
  if (!useHeadless) {
    // In headed debug runs we require explicit placement coordinates so the
    // browser opens on the user-chosen monitor instead of stealing main-screen
    // workspace. Coordinates are monitor-space origin values from macOS display
    // arrangement / OS desktop coordinates.
    const x = parseEnvInt("PLAYWRIGHT_WINDOW_X");
    const y = parseEnvInt("PLAYWRIGHT_WINDOW_Y");
    const width = parseEnvInt("PLAYWRIGHT_WINDOW_WIDTH");
    const height = parseEnvInt("PLAYWRIGHT_WINDOW_HEIGHT");

    if (x === null || y === null || width === null || height === null) {
      throw new Error(
        [
          "Headed e2e runs require explicit external-monitor window placement.",
          "Set PLAYWRIGHT_WINDOW_X, PLAYWRIGHT_WINDOW_Y, PLAYWRIGHT_WINDOW_WIDTH, and PLAYWRIGHT_WINDOW_HEIGHT.",
          "Example:",
          "PLAYWRIGHT_WINDOW_X=2000 PLAYWRIGHT_WINDOW_Y=0 PLAYWRIGHT_WINDOW_WIDTH=1280 PLAYWRIGHT_WINDOW_HEIGHT=900 npm run test:e2e:debug"
        ].join("\n")
      );
    }

    windowArgs = [`--window-position=${x},${y}`, `--window-size=${width},${height}`];
  }

  for (let attempt = 1; attempt <= launchVariants.length; attempt += 1) {
    const variant = launchVariants[attempt - 1];
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "olho-real-e2e-"));
    const args = [
      `--user-data-dir=${userDataDir}`,
      ...(variant.noSandbox ? ["--no-sandbox"] : []),
      "--no-first-run",
      "--no-default-browser-check",
      "--test-type",
      "--enable-automation",
      "--use-mock-keychain",
      "--password-store=basic",
      "--disable-background-networking",
      "--disable-breakpad",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-crash-reporter",
      "--disable-sync",
      "--disable-features=Translate",
      ...(useHeadless ? ["--headless=new"] : []),
      ...windowArgs,
      ...(variant.disableGpu ? ["--disable-gpu"] : []),
      "--remote-debugging-port=0",
      `--disable-extensions-except=${buildDir}`,
      `--load-extension=${buildDir}`,
      "about:blank"
    ];

    const chromeProc = spawn(chromeBinary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TERM:
          process.env.TERM && process.env.TERM !== "dumb"
            ? process.env.TERM
            : "xterm-256color"
      }
    });

    try {
      let stderr = "";
      const wsUrl = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Chrome did not expose DevTools endpoint.\n${stderr}`));
        }, 20_000);

        let stdout = "";
        const onData = (chunk) => {
          const text = chunk.toString();
          stderr += text;
          const combined = `${stderr}\n${stdout}`;
          const match = combined.match(/DevTools listening on (ws:\/\/[^\s]+)/);
          if (match) {
            clearTimeout(timeout);
            resolve(match[1]);
          }
        };

        const onStdout = (chunk) => {
          stdout += chunk.toString();
          const combined = `${stderr}\n${stdout}`;
          const match = combined.match(/DevTools listening on (ws:\/\/[^\s]+)/);
          if (match) {
            clearTimeout(timeout);
            resolve(match[1]);
          }
        };

        chromeProc.stderr.on("data", onData);
        chromeProc.stdout.on("data", onStdout);
        chromeProc.on("exit", (code, signal) => {
          clearTimeout(timeout);
          reject(new Error(`Chrome exited before startup (code ${code}, signal ${signal || "none"}).\n${stderr}\n${stdout}`));
        });
      });

      const browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl
      });

      return {
        browser,
        chromeProc,
        userDataDir
      };
    } catch (error) {
      errors.push(`attempt ${attempt} (${variant.label}): ${String(error?.message || error)}`);
      await terminateProcess(chromeProc).catch(() => {});
      await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
      cleanupOrphanExtensionBrowsers();
      await delay(250);
    }
  }

  throw new Error(`Unable to start Chrome test session after retries.\n${errors.join("\n")}`);
}
