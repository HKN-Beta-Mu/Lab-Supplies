import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const projectRoot = new URL("../", import.meta.url).pathname;
const port = Number.parseInt(process.env.LABKIT_PORT ?? "4173", 10);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const candidate = normalize(join(projectRoot, relativePath));

  if (!candidate.startsWith(projectRoot) || !existsSync(candidate) || statSync(candidate).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentTypes[extname(candidate)] ?? "application/octet-stream",
  });
  createReadStream(candidate).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`LabKit is running at http://127.0.0.1:${port}`);
});
