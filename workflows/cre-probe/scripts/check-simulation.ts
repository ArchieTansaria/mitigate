// Host-side acceptance of probe execution only; never product acceptance.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dir, '..');
mkdirSync(resolve(root, '.build'), { recursive: true });
const results = [];
for (const mode of ['all', 'reject-recipient', 'reject-signature']) {
  const startedAt = new Date().toISOString();
  const child = Bun.spawn(['bun', 'scripts/simulate.ts', mode], {
    cwd: root, stdout: 'pipe', stderr: 'pipe', stdin: 'ignore',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  // Streams are captured separately; retain the boundary instead of inventing interleaving.
  const log = `${stdout}\n--- captured stderr ---\n${stderr}`;
  await Bun.write(resolve(root, '.build', `${mode}.log`), log);
  const expectedError = mode === 'reject-recipient' ? 'SIGNATURE_REJECTED:tampered-recipient'
    : mode === 'reject-signature' ? 'SIGNATURE_REJECTED:tampered-signature' : null;
  let passed = exitCode === 0 && log.includes('PROBE_RESULT ');
  let result = null;
  if (expectedError) {
    passed = exitCode !== 0 && log.includes(expectedError) && !log.includes('PROBE_RESULT ')
      && !log.includes('NEGATIVE_CONTROL_UNEXPECTEDLY_VERIFIED');
  } else if (passed) {
    const line = stdout.split('\n').find((line) => line.includes('PROBE_RESULT '));
    result = JSON.parse(line!.split('PROBE_RESULT ')[1]!);
    passed = result.simulationOnly === true && result.productAcceptance === false
      && result.signatures.checks.length === 5
      && result.signatures.checks.every((check: { verified: boolean; expected: boolean }) => check.verified === check.expected)
      && result.http.statusCode === 200 && typeof result.evm.supported === 'boolean'
      && /^\d+$/.test(result.evm.blockNumber) && /^0x[0-9a-f]{64}$/.test(result.evm.blockHash);
  }
  results.push({ command: `bun run simulate ${mode}`, mode, startedAt, finishedAt: new Date().toISOString(), exitCode, expectedError, passed, result });
  console.log(JSON.stringify({ mode, exitCode, expectedError, passed }));
  if (!passed) break;
}
await Bun.write(resolve(root, '.build', 'runs.json'), JSON.stringify(results, null, 2) + '\n');
if (results.length !== 3 || results.some((result) => !result.passed)) process.exit(1);
