import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  // Proxy approved crest hosts through the app origin so browser CDN resets
  // and CORS issues do not break team images in the client.
  app.get("/api/logo-proxy", async (req, res) => {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    try {
      const target = new URL(rawUrl);
      const allowedHosts = ["a.espncdn.com", "espncdn.com", "media.api-sports.io", "cdn.jsdelivr.net"];
      const allowed = allowedHosts.some((host) => target.hostname === host || target.hostname.endsWith(`.${host}`));
      if (!allowed || !["http:", "https:"].includes(target.protocol)) {
        res.status(400).json({ error: "Logo host is not allowed." });
        return;
      }
      const upstream = await fetch(target, { headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*" } });
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `Logo source returned ${upstream.status}.` });
        return;
      }
      const contentType = upstream.headers.get("content-type") ?? "image/png";
      if (!contentType.startsWith("image/")) {
        res.status(415).json({ error: "Logo source did not return an image." });
        return;
      }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (bytes.byteLength > 2_000_000) {
        res.status(413).json({ error: "Logo image is too large." });
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      res.type(contentType.split(";")[0]).send(bytes);
    } catch {
      res.status(400).json({ error: "Invalid logo URL or unavailable logo source." });
    }
  });

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
