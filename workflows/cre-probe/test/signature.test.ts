import { describe, expect, test } from 'bun:test';
import { cases, checkSignature, vectorDigest } from '../signature.ts';
import vectors from '../../../docs/interfaces/pb03-vectors.json';

describe('PB03 public vectors (host preflight, not CRE evidence)', () => {
  test('digest matches existing cross-language vector', () => {
    expect(String(vectorDigest())).toBe(vectors.expected.receiptDigest);
  });
  for (const entry of cases) {
    test(entry.name, async () => {
      expect(await checkSignature(entry)).toBe(entry.expected);
    });
  }
});
