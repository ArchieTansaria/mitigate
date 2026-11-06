#!/usr/bin/env node
// Foundry standard-JSON adapter for the lockfile-pinned official solc-js compiler.
// Inputs are fully resolved by Foundry. No remote compiler downloads or import callbacks.
import solc from "solc";

if (process.argv.includes("--version")) {
  process.stdout.write(
    `solc, the solidity compiler commandline interface\nVersion: ${solc.version()}\n`,
  );
} else if (process.argv.includes("--standard-json")) {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  process.stdout.write(solc.compile(input));
} else {
  process.stderr.write("Only --version and --standard-json are supported\n");
  process.exitCode = 1;
}
