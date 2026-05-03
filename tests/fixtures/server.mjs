import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pagesDir = path.join(__dirname, "pages");

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"]
]);

function normalizePath(inputPath) {
  const value = decodeURIComponent(String(inputPath || "/"));
  const stripped = value.split("?")[0].split("#")[0];
  const candidate = stripped === "/" ? "/normal-page.html" : stripped;
  const resolved = path.normalize(candidate).replace(/^\.{2}(?:\/+|$)/, "");
  return resolved.startsWith("/") ? resolved : `/${resolved}`;
}

async function readFixtureFile(requestPath) {
  const normalized = normalizePath(requestPath);
  if (normalized === "/favicon.ico") {
    return { body: Buffer.alloc(0), contentType: "image/x-icon", statusCode: 204 };
  }
  const absolute = path.join(pagesDir, normalized);
  const relative = path.relative(pagesDir, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  try {
    const body = await fs.readFile(absolute);
    const ext = path.extname(absolute).toLowerCase();
    const contentType = CONTENT_TYPES.get(ext) || "application/octet-stream";
    return { body, contentType, statusCode: 200 };
  } catch {
    return null;
  }
}

export async function startFixtureServer() {
  const server = http.createServer(async (req, res) => {
    const file = await readFixtureFile(req.url || "/");
    if (!file) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(file.statusCode || 200, {
      "content-type": file.contentType,
      "cache-control": "no-store"
    });
    res.end(file.body);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve fixture server port.");
  }

  const host = "127.0.0.1";
  const port = address.port;
  const baseUrl = `http://${host}:${port}`;

  return {
    host,
    port,
    baseUrl,
    urlFor(name) {
      const clean = String(name || "normal-page.html").replace(/^\/+/, "");
      return `${baseUrl}/${clean}`;
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  };
}
