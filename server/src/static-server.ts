import { createReadStream, existsSync, statSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const appRoot = resolve(process.cwd());

function contentType(path: string): string {
    const types: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json"
    };
    return types[extname(path)] || "application/octet-stream";
}

export function serveStatic(request: IncomingMessage, response: ServerResponse): void {
    const requestPath = new URL(request.url || "/", "http://localhost").pathname;
    const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
    const filePath = normalize(join(appRoot, relativePath));
    if (!filePath.startsWith(appRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
    }
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    createReadStream(filePath).pipe(response);
}