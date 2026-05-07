import { Storage, type Bucket } from "@google-cloud/storage";
import { Readable } from "stream";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function parseObjectPath(p: string): { bucketName: string; objectName: string } {
  const path = p.startsWith("/") ? p : `/${p}`;
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("Invalid object path");
  return { bucketName: parts[0]!, objectName: parts.slice(1).join("/") };
}

/** Returns the configured bucket + object-name prefix for admin uploads. */
function adminLocation(filename: string): { bucket: Bucket; objectName: string } {
  const dir = process.env["PRIVATE_OBJECT_DIR"];
  if (!dir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR is not set — Object Storage has not been provisioned for this app.",
    );
  }
  const { bucketName, objectName: prefix } = parseObjectPath(`${dir.replace(/\/$/, "")}/admin/${filename}`);
  return { bucket: objectStorageClient.bucket(bucketName), objectName: prefix };
}

export function isObjectStorageConfigured(): boolean {
  return Boolean(process.env["PRIVATE_OBJECT_DIR"]);
}

/** Upload a buffer for an admin CMS image. Returns the stored filename. */
export async function uploadAdminImage(
  filename: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { bucket, objectName } = adminLocation(filename);
  await bucket.file(objectName).save(body, {
    contentType,
    resumable: false,
    metadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
  });
}

/** Stream an admin image from object storage as a Web Response, or throw ObjectNotFoundError. */
export async function fetchAdminImage(filename: string): Promise<{
  stream: Readable;
  contentType: string;
  size?: number;
}> {
  const { bucket, objectName } = adminLocation(filename);
  const file = bucket.file(objectName);
  const [exists] = await file.exists();
  if (!exists) throw new ObjectNotFoundError();
  const [metadata] = await file.getMetadata();
  return {
    stream: file.createReadStream(),
    contentType: (metadata.contentType as string) || "application/octet-stream",
    size: metadata.size ? Number(metadata.size) : undefined,
  };
}
