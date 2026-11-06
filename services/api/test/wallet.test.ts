import { hashMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { expect, it } from "vitest";
import { verifyWalletSignature } from "../src/auth/wallet.ts";

const account = privateKeyToAccount(`0x${"03".repeat(32)}`),
  message = "Test-only authentication challenge";
it("checks EIP1271 magic value over the exact signed message digest", async () => {
  const signature = await account.signMessage({ message });
  const valid = await verifyWalletSignature(
    {
      getCode: async () => "0x1234",
      readContract: async (request) => {
        expect(request.args).toEqual([hashMessage(message), signature]);
        expect(request.address).toBe(account.address);
        return "0x1626ba7e";
      },
    },
    account.address,
    message,
    signature,
  );
  expect(valid).toBe(true);
  expect(
    await verifyWalletSignature(
      { getCode: async () => "0x1234", readContract: async () => "0xffffffff" },
      account.address,
      message,
      signature,
    ),
  ).toBe(false);
});
it("fails closed on unavailable code or a reverting/unsupported smart wallet", async () => {
  const signature = await account.signMessage({ message });
  expect(
    await verifyWalletSignature(
      {
        getCode: async () => {
          throw new Error("RPC unavailable");
        },
        readContract: async () => "0x1626ba7e",
      },
      account.address,
      message,
      signature,
    ),
  ).toBe(false);
  expect(
    await verifyWalletSignature(
      {
        getCode: async () => "0x1234",
        readContract: async () => {
          throw new Error("unsupported");
        },
      },
      account.address,
      message,
      signature,
    ),
  ).toBe(false);
});
