import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { Hash32 } from "../../../../packages/schema/src/types.ts";
import { type ArtifactStore, artifactRef, verifyArtifact } from "./store.ts";
export class S3ArtifactStore implements ArtifactStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly maxBytes: number,
  ) {}
  async put(bytes: Uint8Array) {
    const ref = artifactRef(bytes, this.maxBytes);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: `v1/${ref.digest.slice(2)}`,
          Body: bytes,
          ContentType: ref.mediaType,
          IfNoneMatch: "*",
        }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
    } catch (error) {
      if (
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode !== 412
      )
        throw new Error("ARTIFACT_PUBLICATION_FAILED");
    }
    await this.get(ref.digest);
    return ref;
  }
  async get(digest: string) {
    try {
      const id = Hash32.parse(digest);
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: `v1/${id.slice(2)}` }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      if (!result.Body) throw new Error();
      const stream = result.Body.transformToWebStream();
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > this.maxBytes) throw new Error();
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      return verifyArtifact(Buffer.concat(chunks), id, this.maxBytes);
    } catch {
      throw new Error("ARTIFACT_UNAVAILABLE_OR_CORRUPT");
    }
  }
}
