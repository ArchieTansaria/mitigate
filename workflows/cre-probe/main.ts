import {
  Runner, CronCapability, handler, HTTPClient, consensusIdenticalAggregation,
  EVMClient, getNetwork, encodeCallMsg, bytesToHex, LAST_FINALIZED_BLOCK_NUMBER,
  blockNumber, protoBigIntToBigint, type Runtime, type HTTPSendRequester,
} from '@chainlink/cre-sdk';
import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress } from 'viem';
import vectors from '../../docs/interfaces/pb03-vectors.json';
import { cases, checkSignature, vectorDigest } from './signature.ts';

type Config = { mode: 'signatures' | 'http' | 'evm' | 'all'; rejectCase?: string };
const httpUrl = 'https://raw.githubusercontent.com/smartcontractkit/cre-sdk-typescript/main/packages/cre-sdk/package.json';
const router = '0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59';
const destinationSelector = 3034092155422581607n;
const abi = parseAbi(['function isChainSupported(uint64 chainSelector) view returns (bool)']);

function fetchPublicRepository(requester: HTTPSendRequester): string {
  const response = requester.sendRequest({
    url: httpUrl, method: 'GET', headers: { 'User-Agent': 'PatchBond-CRE-capability-probe', Accept: 'application/json' },
    timeout: '10s',
  }).result();
  if (response.statusCode !== 200) throw new Error(`HTTP_STATUS_${response.statusCode}`);
  const body = JSON.parse(new TextDecoder().decode(response.body));
  if (body.name !== '@chainlink/cre-sdk') throw new Error('HTTP_RESPONSE_MISMATCH');
  return JSON.stringify({ statusCode: response.statusCode, packageName: body.name });
}

async function probe(runtime: Runtime<Config>): Promise<string> {
  const { mode, rejectCase } = runtime.config;
  if (!['signatures', 'http', 'evm', 'all'].includes(mode)) throw new Error('UNKNOWN_PROBE_MODE');
  runtime.log('CAPABILITY_PROBE_SIMULATION_ONLY: fixture verification; no product acceptance, report, deployment or transaction');
  if (rejectCase) {
    const entry = cases.find((item) => item.name === rejectCase);
    if (!entry || entry.expected) throw new Error('INVALID_NEGATIVE_CONTROL');
    if (!(await checkSignature(entry))) throw new Error(`SIGNATURE_REJECTED:${entry.name}`);
    throw new Error('NEGATIVE_CONTROL_UNEXPECTEDLY_VERIFIED');
  }
  const result: Record<string, unknown> = { simulationOnly: true, productAcceptance: false };
  if (mode === 'all' || mode === 'signatures') {
    const digest = vectorDigest();
    if (digest !== vectors.expected.receiptDigest) throw new Error('PB03_DIGEST_MISMATCH');
    const checks = [];
    for (const entry of cases) {
      const verified = await checkSignature(entry);
      runtime.log(`SIGNATURE_CHECK ${entry.name} verified=${verified} expected=${entry.expected}`);
      if (verified !== entry.expected) throw new Error(`SIGNATURE_EXPECTATION_FAILED:${entry.name}`);
      checks.push({ name: entry.name, verified, expected: entry.expected });
    }
    result.signatures = { digest, checks };
  }
  if (mode === 'all' || mode === 'http') {
    result.http = JSON.parse(new HTTPClient().sendRequest(runtime, fetchPublicRepository, consensusIdenticalAggregation<string>())().result());
    runtime.log(`HTTP_READ ${JSON.stringify(result.http)}`);
  }
  if (mode === 'all' || mode === 'evm') {
    const network = getNetwork({ chainFamily: 'evm', chainSelectorName: 'ethereum-testnet-sepolia', isTestnet: true });
    if (!network) throw new Error('SEPOLIA_NOT_IN_SDK_NETWORKS');
    const client = new EVMClient(network.chainSelector.selector);
    const header = client.headerByNumber(runtime, { blockNumber: LAST_FINALIZED_BLOCK_NUMBER }).result().header;
    if (!header?.blockNumber || header.hash.length !== 32) throw new Error('MISSING_FINALIZED_HEADER');
    const height = protoBigIntToBigint(header.blockNumber);
    const response = client.callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to: router, data: encodeFunctionData({ abi, functionName: 'isChainSupported', args: [destinationSelector] }) }),
      blockNumber: blockNumber(height),
    }).result();
    const rawData = bytesToHex(response.data);
    const supported = decodeFunctionResult({ abi, functionName: 'isChainSupported', data: rawData });
    result.evm = { sourceChainId: '11155111', sourceSelector: network.chainSelector.selector.toString(), router, destinationSelector: destinationSelector.toString(), blockTag: 'finalized', blockNumber: height.toString(), blockHash: bytesToHex(header.hash), blockTimestamp: header.timestamp.toString(), rawData, supported };
    runtime.log(`EVM_READ ${JSON.stringify(result.evm)}`);
  }
  const output = JSON.stringify(result);
  runtime.log(`PROBE_RESULT ${output}`);
  return output;
}
export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(() => [handler(new CronCapability().trigger({ schedule: '0 */10 * * * *' }), probe)]);
}
main();
