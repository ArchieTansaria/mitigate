import { randomUUID } from "node:crypto";
import { link, mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { keccak256 } from "viem";
import { z } from "zod";
import { Hash32 } from "../../../../packages/schema/src/types.ts";
export const ArtifactRefSchema = z.strictObject({
  schemaVersion: z.literal(1),
  digest: Hash32,
  byteLength: z.number().int().positive(),
  mediaType: z.literal("application/json"),
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export interface ArtifactStore {
  put(bytes: Uint8Array): Promise<ArtifactRef>;
  get(digest: string): Promise<Uint8Array>;
}
export function artifactRef(bytes: Uint8Array, max: number): ArtifactRef {
  if (bytes.length < 1 || bytes.length > max) throw new Error("ARTIFACT_SIZE");
  return {
    schemaVersion: 1,
    digest: keccak256(bytes),
    byteLength: bytes.length,
    mediaType: "application/json",
  };
}
export function verifyArtifact(bytes: Uint8Array, digest: string, max: number) {
  if (artifactRef(bytes, max).digest !== Hash32.parse(digest))
    throw new Error("ARTIFACT_DIGEST_MISMATCH");
  return bytes;
}
export class FileArtifactStore implements ArtifactStore {
  constructor(
    private readonly root: string,
    private readonly maxBytes: number,
  ) {}
  async put(bytes: Uint8Array) {
    const ref = artifactRef(bytes, this.maxBytes);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const tmp = join(this.root, `.${randomUUID()}.tmp`),
      target = join(this.root, ref.digest.slice(2));
    try {
      const file = await open(tmp, "wx", 0o600);
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      try {
        await link(tmp, target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST")
          throw new Error("ARTIFACT_PUBLICATION_FAILED");
      }
    } finally {
      await unlink(tmp).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
    }
    await this.get(ref.digest);
    return ref;
  }
  async get(digest: string) {
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const id = Hash32.parse(digest);
      file = await open(join(this.root, id.slice(2)), "r");
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > this.maxBytes)
        throw new Error("ARTIFACT_SIZE");
      const bytes = Buffer.alloc(this.maxBytes + 1);
      let size = 0;
      while (size < bytes.length) {
        const chunk = await file.read(bytes, size, bytes.length - size, null);
        if (chunk.bytesRead === 0) break;
        size += chunk.bytesRead;
      }
      return verifyArtifact(bytes.subarray(0, size), id, this.maxBytes);
    } catch {
      throw new Error("ARTIFACT_UNAVAILABLE_OR_CORRUPT");
    } finally {
      await file?.close();
    }
  }
}
