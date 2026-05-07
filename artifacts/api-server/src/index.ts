import app from "./app";
import { logger } from "./lib/logger";

// Background jobs (PDF parsing, OCR via pdfjs/tesseract) can produce
// detached promise rejections deep inside their worker pipelines that
// our caller-level try/catch blocks cannot intercept. Without this
// handler Node ≥ 20 terminates the entire api-server process on the
// first such rejection, taking down auth + every other route with it.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection (kept process alive)");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception (kept process alive)");
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
