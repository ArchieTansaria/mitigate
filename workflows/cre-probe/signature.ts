import { hashTypedData, verifyTypedData, type Hex } from 'viem';
import { receiptTypedData } from '../../packages/schema/src/encoding.ts';
import vectors from '../../docs/interfaces/pb03-vectors.json';

// Consume the actual shared encoding and public signed fixture. No signing key.
const original = receiptTypedData(vectors.policy, vectors.receipt);
type TypedReceipt = typeof original;
export type SignatureCase = {
  name: string;
  typedData: TypedReceipt;
  signature: Hex;
  expected: boolean;
};
const signature = vectors.signature as Hex;
const changedByte = signature.slice(2, 4) === '00' ? '01' : '00';
export const cases: SignatureCase[] = [
  { name: 'valid', typedData: original, signature, expected: true },
  {
    name: 'tampered-recipient', signature, expected: false,
    typedData: { ...original, message: { ...original.message, recipient: vectors.policy.supplier as Hex } },
  },
  {
    name: 'tampered-evidence', signature, expected: false,
    typedData: { ...original, message: { ...original.message, evidenceDigest: vectors.receipt.receiptId as Hex } },
  },
  {
    name: 'wrong-destination-domain', signature, expected: false,
    typedData: { ...original, domain: { ...original.domain, chainId: original.domain.chainId + 1n } },
  },
  {
    name: 'tampered-signature', typedData: original,
    signature: `0x${changedByte}${signature.slice(4)}`, expected: false,
  },
];
export const vectorDigest = () => hashTypedData(original);
export async function checkSignature(entry: SignatureCase): Promise<boolean> {
  return verifyTypedData({ ...entry.typedData, address: vectors.signer as Hex, signature: entry.signature });
}
