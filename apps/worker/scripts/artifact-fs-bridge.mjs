#!/usr/bin/env node
/**
 * Host-filesystem bridge for local Wrangler (workerd cannot mkdir on host disk).
 * Serves PUT/GET/HEAD for opaque object keys under ARTIFACT_DATA_ROOT.
 * Never logs object bytes.
 */
import http from "node:http";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(__dirname, "..");

function resolveRoot() {
  if (process.env.ARTIFACT_DATA_ROOT?.trim()) {
    return path.resolve(process.env.ARTIFACT_DATA_ROOT.trim());
  }
  const devVars = path.join(workerRoot, ".dev.vars");
  if (existsSync(devVars)) {
    for (const line of readFileSync(devVars, "utf8").split("\n")) {
      if (line.startsWith("ARTIFACT_DATA_ROOT=")) {
        const v = line
          .slice("ARTIFACT_DATA_ROOT=".length)
          .trim()
          .replace(/^["']|["']$/g, "");
        if (v) return path.resolve(v);
      }
    }
  }
  return path.resolve(workerRoot, ".data", "artifacts");
}

const ROOT = resolveRoot();
const PORT = Number.parseInt(process.env.ARTIFACT_FS_BRIDGE_PORT ?? "8791", 10);
const HOST = process.env.ARTIFACT_FS_BRIDGE_HOST ?? "127.0.0.1";

function keyFromUrl(url) {
  const u = new URL(url, `http://${HOST}`);
  const key = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!key || key.includes("/") || key.includes("\\") || key.includes("..")) {
    return null;
  }
  return key;
}

async function main() {
  await fs.mkdir(ROOT, { recursive: true });
  const server = http.createServer(async (req, res) => {
    try {
      const key = keyFromUrl(req.url ?? "/");
      if (key === null) {
        res.writeHead(400).end("bad_key");
        return;
      }
      const objectPath = path.join(ROOT, key);
      const metaPath = `${objectPath}.meta.json`;

      if (req.method === "PUT") {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const buf = Buffer.concat(chunks);
        const contentType =
          req.headers["content-type"]?.split(";")[0]?.trim() ||
          "application/octet-stream";
        const tmp = `${objectPath}.tmp`;
        await fs.writeFile(tmp, buf);
        await fs.writeFile(
          metaPath,
          JSON.stringify({ contentType, byteSize: buf.byteLength }),
        );
        await fs.rename(tmp, objectPath);
        res.writeHead(204).end();
        return;
      }

      if (req.method === "GET" || req.method === "HEAD") {
        try {
          await fs.access(objectPath);
        } catch {
          res.writeHead(404).end("missing");
          return;
        }
        let contentType = "application/octet-stream";
        let byteSize = 0;
        try {
          const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
          contentType = meta.contentType ?? contentType;
          byteSize = meta.byteSize ?? 0;
        } catch {
          const st = await fs.stat(objectPath);
          byteSize = st.size;
        }
        if (req.method === "HEAD") {
          res.writeHead(200, {
            "content-type": contentType,
            "content-length": String(byteSize),
          });
          res.end();
          return;
        }
        const bytes = await fs.readFile(objectPath);
        res.writeHead(200, {
          "content-type": contentType,
          "content-length": String(bytes.byteLength),
        });
        res.end(bytes);
        return;
      }

      res.writeHead(405).end("method");
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      console.error("ARTIFACT_FS_BRIDGE_ERROR", name);
      res.writeHead(500).end("error");
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`artifact-fs-bridge root=${ROOT} listen=${HOST}:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
