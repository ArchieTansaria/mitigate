import { createRequire } from "node:module";
import { createWalletClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, expect, it } from "vitest";
import { verifyWalletSignature } from "../src/auth/wallet.ts";
import { startChain } from "./chain.ts";

let chain: Awaited<ReturnType<typeof startChain>>;
beforeAll(async () => {
  chain = await startChain();
});
afterAll(async () => chain?.stop());
it("authenticates an actual deployed EIP1271 wallet on local Anvil, rejecting altered signatures", async () => {
  const source =
    "pragma solidity ^0.8.28; contract TestWallet { address immutable owner; constructor(address account){owner=account;} function isValidSignature(bytes32 digest,bytes calldata sig) external view returns(bytes4){if(sig.length!=65)return 0xffffffff; bytes32 r;bytes32 s;uint8 v; assembly {r:=calldataload(sig.offset) s:=calldataload(add(sig.offset,32)) v:=byte(0,calldataload(add(sig.offset,64)))} return ecrecover(digest,v,r,s)==owner?bytes4(0x1626ba7e):bytes4(0xffffffff);}}";
  const solc = createRequire(import.meta.url)("solc") as {
    compile: (input: string) => string;
  };
  const compiled = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: { "TestWallet.sol": { content: source } },
        settings: {
          evmVersion: "cancun",
          outputSelection: { "*": { "*": ["evm.bytecode.object"] } },
        },
      }),
    ),
  );
  const bytecode =
    `0x${compiled.contracts["TestWallet.sol"].TestWallet.evm.bytecode.object}` as Hex;
  // Standard disposable Anvil account; never used on testnet.
  const account = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );
  const wallet = createWalletClient({
    account,
    chain: foundry,
    transport: http(chain.url),
  });
  const hash = await wallet.deployContract({
    abi: [
      {
        type: "constructor",
        inputs: [{ name: "account", type: "address" }],
        stateMutability: "nonpayable",
      },
    ],
    bytecode,
    args: [account.address],
  });
  const receipt = await chain.client.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error("Missing wallet address");
  const message = "Local EIP1271 integration proof";
  const signature = await account.signMessage({ message });
  expect(
    await verifyWalletSignature(
      chain.client,
      receipt.contractAddress,
      message,
      signature,
    ),
  ).toBe(true);
  expect(
    await verifyWalletSignature(
      chain.client,
      receipt.contractAddress,
      `${message} modified`,
      signature,
    ),
  ).toBe(false);
});
