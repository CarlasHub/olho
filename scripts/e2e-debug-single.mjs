import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const parsed = {
    file: "",
    test: ""
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--file") {
      parsed.file = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (token === "--test") {
      parsed.test = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }
  }

  return parsed;
}

function usage() {
  return [
    "Olho single-test debug runner (safe desktop mode)",
    "",
    "Usage:",
    "  npm run test:e2e:debug -- --file tests/e2e-real-capture-recorder.test.mjs --test \"exact failing test name\"",
    "",
    "Required env vars for headed step:",
    "  PLAYWRIGHT_WINDOW_X, PLAYWRIGHT_WINDOW_Y, PLAYWRIGHT_WINDOW_WIDTH, PLAYWRIGHT_WINDOW_HEIGHT",
    "",
    "Flow:",
    "  1) headless single test first",
    "  2) headed single test only if headless fails",
    "  3) headless verification rerun",
    "",
    "Notes:",
    "  - Uses a temporary browser profile via tests/e2e-real-utils.mjs",
    "  - Never runs the full headed suite"
  ].join("\n");
}

function assertInput(file, testName) {
  if (!file || !testName) {
    console.error(usage());
    process.exit(1);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runNodeTest({ file, testName, headed }) {
  const absoluteFile = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const pattern = `^${escapeRegex(testName)}$`;
  const args = [
    "--test",
    "--test-concurrency=1",
    absoluteFile,
    `--test-name-pattern=${pattern}`
  ];

  const env = {
    ...process.env,
    OLHO_E2E_HEADED: headed ? "1" : "0",
    OLHO_E2E_HEADLESS: headed ? "0" : "1"
  };

  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env
  });
  return Number(result.status ?? 1);
}

function assertHeadedWindowEnv() {
  const required = [
    "PLAYWRIGHT_WINDOW_X",
    "PLAYWRIGHT_WINDOW_Y",
    "PLAYWRIGHT_WINDOW_WIDTH",
    "PLAYWRIGHT_WINDOW_HEIGHT"
  ];
  const missing = required.filter((name) => !String(process.env[name] || "").trim());
  if (missing.length) {
    console.error(
      [
        "Headed debug requires explicit external monitor placement.",
        `Missing: ${missing.join(", ")}`,
        "Example:",
        "PLAYWRIGHT_WINDOW_X=2000 PLAYWRIGHT_WINDOW_Y=0 PLAYWRIGHT_WINDOW_WIDTH=1280 PLAYWRIGHT_WINDOW_HEIGHT=900 npm run test:e2e:debug -- --file tests/e2e-real-capture-recorder.test.mjs --test \"exact failing test name\""
      ].join("\n")
    );
    process.exit(1);
  }
}

function main() {
  const { file, test, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(usage());
    return;
  }
  assertInput(file, test);

  console.log("\n[1/3] Headless single-test run with diagnostics\n");
  const headlessStatus = runNodeTest({ file, testName: test, headed: false });
  if (headlessStatus === 0) {
    console.log("\nHeadless run passed. Headed debug is not needed.\n");
    process.exit(0);
  }

  console.log("\n[2/3] Headed single-test run (debug only)\n");
  assertHeadedWindowEnv();
  const headedStatus = runNodeTest({ file, testName: test, headed: true });

  console.log("\n[3/3] Headless verification rerun\n");
  const verifyStatus = runNodeTest({ file, testName: test, headed: false });

  if (headedStatus !== 0 || verifyStatus !== 0) {
    process.exit(1);
  }
}

main();
