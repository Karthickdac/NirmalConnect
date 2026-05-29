import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  fetchAdminImage,
  isObjectStorageConfigured,
  ObjectNotFoundError,
} from "./lib/objectStorage";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Uploaded-file serving ────────────────────────────────────────────
// Admin CMS images now live in Replit Object Storage; legacy files (and
// grievance attachments) still live on local disk under ./uploads.
//
// Resolution order for /uploads/admin/:filename:
//   1. Local disk (legacy uploads from before the object-storage migration).
//   2. Object Storage (everything uploaded after the migration).
//
// The /uploads and /api/uploads mounts both work so the path-based proxy
// (which only routes /api → this service) can still reach files via the
// browser.
const uploadsRoot = path.resolve(process.cwd(), "uploads");
const attachedAssetsRoot = path.resolve(process.cwd(), "..", "..", "attached_assets");
const ADMIN_FILENAME_RE = /^[A-Za-z0-9._-]+$/;

async function serveAdminFromBucket(filename: string, res: Response): Promise<boolean> {
  if (!isObjectStorageConfigured()) return false;
  try {
    const obj = await fetchAdminImage(filename);
    res.setHeader("Content-Type", obj.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (obj.size != null) res.setHeader("Content-Length", String(obj.size));
    obj.stream.on("error", (err) => {
      logger.error({ err, filename }, "object-storage stream error");
      if (!res.headersSent) res.status(500).end();
      else res.destroy(err);
    });
    obj.stream.pipe(res);
    return true;
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return false;
    logger.error({ err, filename }, "object-storage fetch error");
    if (!res.headersSent) res.status(502).json({ error: "Storage unavailable" });
    return true;
  }
}

const adminBucketHandler = async (req: Request, res: Response): Promise<void> => {
  const raw = req.params["filename"];
  const filename = Array.isArray(raw) ? raw[0] : raw;
  if (!filename || !ADMIN_FILENAME_RE.test(filename)) {
    res.status(404).end();
    return;
  }
  const served = await serveAdminFromBucket(filename, res);
  if (!served) res.status(404).end();
};

const uploadsStatic = express.static(uploadsRoot, { dotfiles: "deny", fallthrough: true });

// 1) Try disk first (handles legacy admin files + grievance attachments).
// 2) For /uploads/admin/* misses, fall back to Object Storage.
app.use("/uploads", uploadsStatic);
app.get("/uploads/admin/:filename", adminBucketHandler);
app.use("/api/uploads", uploadsStatic);
app.get("/api/uploads/admin/:filename", adminBucketHandler);

// Serve project attached_assets at /media and /api/media
const mediaStatic = express.static(attachedAssetsRoot, { dotfiles: "deny" });
app.use("/media", mediaStatic);
app.use("/api/media", mediaStatic);

app.use("/api", router);

// ── Production: serve the built React frontend ────────────────────────────
// In production (CloudPanel VPS), Express serves the Vite-built frontend
// directly so everything runs on a single port (5005) behind CloudPanel's
// reverse proxy. The SPA fallback (index.html) must come AFTER all API routes.
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.resolve(process.cwd(), "artifacts/nirmal-connect/dist");
  app.use(express.static(frontendDist, { dotfiles: "deny" }));
  app.use((_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
