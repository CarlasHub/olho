import { spawn } from "node:child_process";

const files = [
  "tests/privacy-gate.test.mjs",
  "tests/privacy-cost-security-audit.test.mjs",
  "tests/no-owner-cost-audit.test.mjs",
  "tests/performance-cleanup-audit.test.mjs",
  "tests/e2e-real-runtime-network.test.mjs"
];

const args = ["--test", "--test-concurrency=1", ...files];

const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^npm_/i.test(key)) {
    delete env[key];
  }
}

if (!env.TERM || env.TERM === "dumb") {
  env.TERM = "xterm-256color";
}

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

