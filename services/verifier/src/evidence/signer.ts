import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import { NonzeroAddress } from "../../../../packages/schema/src/types.ts";
// This host-side signer is never passed into the execution container. Use a dedicated unfunded verifier key,
// never a supplier, customer, deployment or treasury wallet. Production can replace this with a remote signer.
export async function loadEvidenceSigner(
  path: string,
  expectedAddress: string,
) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.size < 66 ||
      stat.size > 67 ||
      (stat.mode & 0o077) !== 0 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw new Error("PRIVATE_VERIFIER_KEY_FILE_REQUIRED");
    const text = (await file.readFile("utf8")).trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(text))
      throw new Error("INVALID_VERIFIER_KEY_FILE");
    const signer = privateKeyToAccount(text as `0x${string}`);
    if (signer.address !== NonzeroAddress.parse(expectedAddress))
      throw new Error("EVALUATOR_MISMATCH");
    return signer;
  } finally {
    await file.close();
  }
}
