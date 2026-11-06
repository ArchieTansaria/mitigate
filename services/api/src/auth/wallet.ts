import {
  type Address,
  type Hex,
  hashMessage,
  parseAbi,
  verifyMessage,
} from "viem";
export const walletAbi = parseAbi([
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
]);
export type WalletReader = {
  getCode: (args: { address: Address }) => Promise<Hex | undefined>;
  readContract: (args: {
    address: Address;
    abi: typeof walletAbi;
    functionName: "isValidSignature";
    args: readonly [Hex, Hex];
  }) => Promise<unknown>;
};
export async function verifyWalletSignature(
  reader: WalletReader,
  address: Address,
  message: string,
  signature: Hex,
) {
  try {
    const code = await reader.getCode({ address });
    if (!code || code === "0x")
      return await verifyMessage({ address, message, signature });
    // Explicit EIP-1271 only: no counterfactual wallet deployment or EIP-6492 execution.
    return (
      (await reader.readContract({
        address,
        abi: walletAbi,
        functionName: "isValidSignature",
        args: [hashMessage(message), signature],
      })) === "0x1626ba7e"
    );
  } catch {
    return false;
  }
}
export type WalletVerifier = (
  address: Address,
  message: string,
  signature: Hex,
) => Promise<boolean>;
