#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { foundryBinary } from "./foundry-binary.ts";

const compiler = fileURLToPath(new URL("./solc.mjs", import.meta.url));
const [command = "test", ...args] = process.argv.slice(2);
const result = spawnSync(
  foundryBinary("forge"),
  [command, "--root", "contracts", "--use", compiler, ...args],
  { stdio: "inherit" },
);
if (result.error)
  console.error("Foundry could not start; run pnpm install first.");
process.exitCode = result.status ?? 1;
