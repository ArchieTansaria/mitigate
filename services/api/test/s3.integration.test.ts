import { createServer } from "node:http";
import { S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, expect, it } from "vitest";
import { S3ArtifactStore } from "../src/artifacts/s3.ts";
import { must } from "./assert.ts";

let server: ReturnType<typeof createServer>,
  store: S3ArtifactStore,
  client: S3Client;
const objects = new Map<string, Buffer>();
let corrupt = false,
  readFail = false,
  conditional = false;
beforeAll(async () => {
  server = createServer(async (req, res) => {
    const key = must((req.url ?? "").split("?")[0]);
    if (req.method === "PUT") {
      conditional = req.headers["if-none-match"] === "*";
      if (objects.has(key)) {
        res.writeHead(412);
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c);
      objects.set(key, Buffer.concat(chunks));
      res.writeHead(200, { etag: '"test"' });
      res.end();
      return;
    }
    if (req.method === "GET") {
      if (readFail || !objects.has(key)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(corrupt ? "tampered" : objects.get(key));
      return;
    }
    res.writeHead(405);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error();
  client = new S3Client({
    endpoint: `http://127.0.0.1:${address.port}`,
    region: "us-east-1",
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: { accessKeyId: "test-only", secretAccessKey: "test-only" },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  store = new S3ArtifactStore(client, "test-artifacts", 128);
});
afterAll(async () => {
  client?.destroy();
  await new Promise<void>((r) => server?.close(() => r()));
});
it("uses conditional publication and verifies actual SDK roundtrip bytes", async () => {
  const ref = await store.put(Buffer.from('{"proof":"test"}'));
  expect(conditional).toBe(true);
  expect(Buffer.from(await store.get(ref.digest)).toString()).toBe(
    '{"proof":"test"}',
  );
  expect(await store.put(Buffer.from('{"proof":"test"}'))).toEqual(ref);
});
it("rejects partial publication, corrupt content and oversized writes", async () => {
  readFail = true;
  await expect(store.put(Buffer.from('{"partial":true}'))).rejects.toThrow(
    "ARTIFACT",
  );
  readFail = false;
  corrupt = true;
  await expect(store.put(Buffer.from('{"corrupt":true}'))).rejects.toThrow(
    "ARTIFACT",
  );
  corrupt = false;
  await expect(store.put(Buffer.alloc(129))).rejects.toThrow("ARTIFACT");
});
