"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const publicFiles = new Set(["index.html", "styles.css", "math.js", "app.js", "favicon.svg", "campaign.js", "manifest.webmanifest", "assets/jungle.svg", "assets/lion.svg", "assets/elephant.svg", "assets/fox.svg", "assets/rabbit.svg", "assets/turtle.svg", "assets/dolphin.svg"]);

const server = http.createServer((request, response) => {
  let filename;
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    filename = pathname === "/" ? "index.html" : pathname.slice(1);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  if (!publicFiles.has(filename)) {
    response.writeHead(404).end("Not found");
    return;
  }
  fs.readFile(path.join(root, filename), (error, contents) => {
    if (error) {
      response.writeHead(500).end("Unable to read file");
      return;
    }
    response.writeHead(200, { "Content-Type": types[path.extname(filename)], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : contents);
  });
});
server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`Local: http://localhost:${port}`));
