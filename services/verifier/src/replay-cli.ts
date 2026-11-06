import { open } from "node:fs/promises";
import { replayEvidence } from "./replay.ts";

async function readJson(path: string) {
  const file = await open(path, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 1048576) throw new Error("INPUT_LIMIT");
    return JSON.parse(await file.readFile("utf8"));
  } finally {
    await file.close();
  }
}
async function main() {
  const [evidence, scope, historical] = process.argv.slice(2);
  if (
    !evidence ||
    !scope ||
    (historical !== undefined && historical !== "--historical")
  )
    throw new Error(
      "Usage: replay-cli.ts evidence.json trusted-scope.json [--historical]",
    );
  const input = await readJson(evidence),
    spec = await readJson(scope);
  // Explicit historical mode verifies signature/coverage at issuance; never claims present freshness.
  const now = historical
    ? BigInt(input.body.issuedAt)
    : BigInt(Math.floor(Date.now() / 1000));
  const result = await replayEvidence(input, spec, now);
  console.log(
    JSON.stringify({
      ...result,
      freshness: historical ? "historical-only" : "currently-valid",
    }),
  );
  if (!result.matched) process.exitCode = 1;
}
main().catch(() => {
  console.error(
    "Replay failed: check trusted scope, signature, freshness, approved artifacts and Docker availability.",
  );
  process.exitCode = 1;
});
