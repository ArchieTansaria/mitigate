import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createPublicClient, http } from "viem";
import { foundryBinary } from "../../../scripts/foundry-binary.ts";
export async function startChain(chainId = 31337) {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error();
  const port = addr.port;
  await new Promise<void>((r) => server.close(() => r()));
  const child = spawn(
    foundryBinary("anvil"),
    [
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--chain-id",
      String(chainId),
      "--silent",
    ],
    { stdio: "ignore" },
  );
  let failed = false;
  child.on("error", () => {
    failed = true;
  });
  const url = `http://127.0.0.1:${port}`,
    client = createPublicClient({
      transport: http(url, { timeout: 500, retryCount: 0 }),
    });
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await new Promise<void>((r) => child.once("exit", () => r()));
    }
  };
  try {
    for (let i = 0; i < 80; i++) {
      if (failed) throw new Error("Anvil startup failed");
      try {
        await client.getChainId();
        return { url, client, stop };
      } catch {
        await delay(50);
      }
    }
    throw new Error("Anvil timeout");
  } catch (error) {
    await stop();
    throw error;
  }
}
