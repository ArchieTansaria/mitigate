import { createRequire } from "node:module";
export function foundryBinary(tool: "forge" | "anvil"): string {
  const require = createRequire(import.meta.url);
  const scoped = createRequire(
    require.resolve(`@foundry-rs/${tool}/package.json`),
  );
  const arch = process.arch === "x64" ? "amd64" : process.arch;
  const binary = process.platform === "win32" ? `${tool}.exe` : tool;
  return scoped.resolve(
    `@foundry-rs/${tool}-${process.platform}-${arch}/bin/${binary}`,
  );
}
