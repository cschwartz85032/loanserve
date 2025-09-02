import { createHash } from "crypto";

export function sha256Buf(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256Json(obj: any): string {
  return sha256Buf(Buffer.from(JSON.stringify(obj)));
}