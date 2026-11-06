#!/usr/bin/env node
// Fixture-local entrypoint; the compiler is always an absolute path.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { foundryBinary } from "../scripts/foundry-binary.ts";
const root = fileURLToPath(new URL(".", import.meta.url));
const compiler = fileURLToPath(new URL("../scripts/solc.mjs", import.meta.url));
const [command = "test", ...args] = process.argv.slice(2);
const result = spawnSync(
  foundryBinary("forge"),
  [command, "--root", root, "--use", compiler, ...args],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
