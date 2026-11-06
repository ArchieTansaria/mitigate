import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decodeAbiParameters,
  encodeFunctionData,
  getAddress,
  type Hex,
  keccak256,
  parseAbi,
  toHex,
} from "viem";
import { canonicalHash } from "../../../../packages/schema/src/encoding.ts";
import { ManifestSchema } from "../../../../packages/schema/src/types.ts";
import {
  assertRecognizedState,
  type Inspection,
  type InspectionAssertion,
  loadSupportedPattern,
} from "../inspect/transparent-oracle.ts";
import { containerArguments, runBoundedProcess } from "../runtime.ts";
export const RUNNER_IMAGE =
  "ghcr.io/foundry-rs/foundry@sha256:8347b728d5d393dac1c018691b36f506d23b9dcd78341d40ea0fcb11c3a19cdd";
export type ApprovedPack = {
  digest: Hex;
  harnessCode: Hex;
  harnessHash: Hex;
  files: Array<{ path: string; digest: Hex }>;
};
export async function loadApprovedPack(
  root = new URL("../../../../", import.meta.url),
): Promise<ApprovedPack> {
  const files = [];
  for (const path of [
    "OracleAdapterAssertions.sol",
    "pack.json",
    "README.md",
  ]) {
    const bytes = await readFile(
      new URL(`testpacks/oracle-adapter/${path}`, root),
    );
    files.push({ path, digest: keccak256(toHex(bytes)) });
  }
  const artifact = JSON.parse(
    await readFile(
      new URL(
        "fixtures/out/VerificationHarness.sol/VerificationHarness.json",
        root,
      ),
      "utf8",
    ),
  );
  const assertionHash = files.find(
    (f) => f.path === "OracleAdapterAssertions.sol",
  )?.digest;
  const harnessSourceHash = keccak256(
    toHex(
      await readFile(new URL("fixtures/src/VerificationHarness.sol", root)),
    ),
  );
  const sources = artifact.metadata?.sources;
  if (
    !assertionHash ||
    sources?.["testpack/OracleAdapterAssertions.sol"]?.keccak256 !==
      assertionHash ||
    sources?.["src/VerificationHarness.sol"]?.keccak256 !== harnessSourceHash ||
    Object.keys(sources ?? {}).length !== 2
  )
    throw new Error("STALE_COMPILED_TEST_PACK");
  const harnessCode = artifact.deployedBytecode.object as Hex;
  if (
    !/^0x([0-9a-f]{2})+$/i.test(harnessCode) ||
    Object.keys(artifact.deployedBytecode.immutableReferences ?? {}).length
  )
    throw new Error("BUILD_APPROVED_HARNESS_FIRST");
  return {
    digest: canonicalHash({ schemaVersion: 1, files }),
    harnessCode,
    harnessHash: keccak256(harnessCode),
    files,
  };
}
export type RunnerResult = {
  schemaVersion: 1;
  status: "completed" | "unsupported" | "unknown";
  reason: string | null;
  executionKind: "isolated-state-replay";
  claimEligible: false;
  assertions: InspectionAssertion[];
  interventions: Array<{
    id: string;
    target: string;
    storage: Record<string, string>;
    explanation: string;
  }>;
  container: { image: string; network: "none"; memoryMiB: 256 };
  trace: {
    stateDigest: Hex;
    scriptDigest?: Hex;
    harnessHash: Hex;
    responses?: Record<string, { success: boolean; data: Hex }>;
  };
};
const harnessAbi = parseAbi([
  "function context() view returns (uint256 timestamp,uint256 chainId)",
  "function evaluate(bytes assertion) view returns (bool success, bytes result)",
  "function observe(address target,bytes data) view returns (bool success,bytes result)",
  "function assertQuote(address market,uint256 amount,uint256 expectedValue) view",
  "function assertStaleRejected(address market) view",
]);
const quoteAbi = parseAbi([
  "function quoteCollateral(uint256 amount) view returns (uint256)",
]);
const shellQuote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
export async function runTestPack(input: {
  inspection: Inspection;
  manifest: unknown;
  pack: ApprovedPack;
  dockerBinary?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<RunnerResult> {
  const { inspection, pack } = input,
    m = ManifestSchema.parse(input.manifest);
  const stateDigest = canonicalHash({
    snapshot: inspection.snapshot,
    state: inspection.observed?.state ?? {},
  });
  const base = {
    schemaVersion: 1 as const,
    executionKind: "isolated-state-replay" as const,
    claimEligible: false as const,
    container: {
      image: RUNNER_IMAGE,
      network: "none" as const,
      memoryMiB: 256 as const,
    },
    trace: { stateDigest, harnessHash: pack.harnessHash },
  };
  const fail = (
    status: "unknown" | "unsupported",
    reason: string,
  ): RunnerResult => ({
    ...base,
    status,
    reason,
    interventions: [],
    assertions: ["valid-quote", "stale-rejected"].map((id) => ({
      id,
      outcome: status,
      expected: "approved isolated regression",
      observed: reason,
      evidenceRef: canonicalHash({ stateDigest, reason }),
    })),
  });
  if (m.testPackDigest !== pack.digest)
    return fail("unsupported", "UNAPPROVED_TEST_PACK");
  if (inspection.status !== "supported" || !inspection.observed)
    return fail(
      inspection.status === "unsupported" ? "unsupported" : "unknown",
      "NO_SUPPORTED_OBSERVATION",
    );
  if (inspection.snapshot.chainId !== m.sourceChainId)
    return fail("unknown", "CHAIN_MISMATCH");
  const timeoutMs = input.timeoutMs ?? 30000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
    return fail("unknown", "INVALID_EXECUTION_LIMIT");
  try {
    assertRecognizedState(inspection.observed, await loadSupportedPattern());
  } catch {
    return fail("unsupported", "UNRECOGNIZED_REPLAY_STATE");
  }
  const o = inspection.observed,
    timestamp = BigInt(inspection.snapshot.blockTimestamp),
    age = BigInt(o.maxAge);
  if (age < 1n || age >= timestamp - 1n)
    return fail("unsupported", "UNSUPPORTED_STALE_SCENARIO");
  // Exact runtime recognition in PB-08 proves these finite storage layouts. No arbitrary runtime is executed.
  // Materialization uses original observed code; only price/timestamp are changed in explicitly separate scenarios.
  const harness = getAddress(`0x${pack.harnessHash.slice(-40)}`);
  if (o.state[harness]) return fail("unsupported", "HARNESS_ADDRESS_COLLISION");
  const price = 200000000000n,
    amount = 3n * 10n ** 18n,
    expected = (amount * price) / 10n ** 8n;
  const priceSlot = toHex(1n, { size: 32 }),
    timeSlot = toHex(2n, { size: 32 });
  const interventions = [
    {
      id: "valid-quote",
      target: o.source,
      storage: {
        [priceSlot]: toHex(price, { size: 32 }),
        [timeSlot]: toHex(timestamp, { size: 32 }),
      },
      explanation:
        "Fresh positive price in an isolated branch; original deployed bytecode and configuration unchanged.",
    },
    {
      id: "stale-rejected",
      target: o.source,
      storage: {
        [priceSlot]: toHex(price, { size: 32 }),
        [timeSlot]: toHex(timestamp - age - 1n, { size: 32 }),
      },
      explanation:
        "Independent branch with nonzero price timestamp maxAge+1 seconds old; requires exact StalePrice revert through original entrypoint.",
    },
  ];
  const rpc = (method: string, params: unknown[]) =>
    `cast rpc --rpc-url http://127.0.0.1:8545 --rpc-timeout 2 --raw ${shellQuote(method)} ${shellQuote(JSON.stringify(params))}`;
  const script = [
    "#!/bin/sh",
    "set -eu",
    "export RAYON_NUM_THREADS=1 TOKIO_WORKER_THREADS=1",
    `anvil --host 127.0.0.1 --port 8545 --chain-id ${BigInt(inspection.snapshot.chainId)} --timestamp ${timestamp - 1n} --no-mining --silent > /tmp/anvil.log 2>&1 &`,
    "pid=$!",
    "trap 'kill $pid 2>/dev/null || true' EXIT",
    'ready=0; for i in 1 2 3 4 5 6 7 8 9 10; do if cast block-number --rpc-url http://127.0.0.1:8545 --rpc-timeout 1 >/dev/null 2>&1; then ready=1; break; fi; sleep 0.1; done; test "$ready" = 1',
    `${rpc("evm_setNextBlockTimestamp", [toHex(timestamp)])} >/dev/null`,
    `${rpc("evm_mine", [])} >/dev/null`,
    `test "$(cast block latest --field timestamp --rpc-url http://127.0.0.1:8545 --rpc-timeout 2)" = ${timestamp}`,
  ];
  for (const [address, account] of Object.entries(o.state).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    script.push(`${rpc("anvil_setCode", [address, account.code])} >/dev/null`);
    for (const [slot, value] of Object.entries(account.storage).sort(
      ([a], [b]) => a.localeCompare(b),
    ))
      script.push(
        `${rpc("anvil_setStorageAt", [address, slot, value])} >/dev/null`,
      );
  }
  script.push(
    `${rpc("anvil_setCode", [harness, pack.harnessCode])} >/dev/null`,
  );
  const record = (id: string, data: Hex) =>
    script.push(
      `result=$(${rpc("eth_call", [{ to: harness, data, gas: "0x989680" }, "latest"])}); printf '%s\\n' ${shellQuote(`PB_RESULT_${id}=`)}"$result"`,
    );
  record(
    "context",
    encodeFunctionData({
      abi: harnessAbi,
      functionName: "observe",
      args: [
        harness,
        encodeFunctionData({ abi: harnessAbi, functionName: "context" }),
      ],
    }),
  );
  record(
    "source",
    encodeFunctionData({
      abi: harnessAbi,
      functionName: "observe",
      args: [
        o.source,
        encodeFunctionData({
          abi: parseAbi([
            "function latestPrice() view returns (uint256 price,uint256 updatedAt)",
          ]),
          functionName: "latestPrice",
        }),
      ],
    }),
  );
  record(
    "original",
    encodeFunctionData({
      abi: harnessAbi,
      functionName: "observe",
      args: [
        o.entrypoint,
        encodeFunctionData({
          abi: quoteAbi,
          functionName: "quoteCollateral",
          args: [amount],
        }),
      ],
    }),
  );
  for (const scenario of interventions) {
    script.push(`snap=$(${rpc("evm_snapshot", [])})`);
    for (const [slot, value] of Object.entries(scenario.storage))
      script.push(
        `${rpc("anvil_setStorageAt", [scenario.target, slot, value])} >/dev/null`,
      );
    const assertion =
      scenario.id === "valid-quote"
        ? encodeFunctionData({
            abi: harnessAbi,
            functionName: "assertQuote",
            args: [o.entrypoint, amount, expected],
          })
        : encodeFunctionData({
            abi: harnessAbi,
            functionName: "assertStaleRejected",
            args: [o.entrypoint],
          });
    record(
      scenario.id,
      encodeFunctionData({
        abi: harnessAbi,
        functionName: "evaluate",
        args: [assertion],
      }),
    );
    script.push(
      'cast rpc --rpc-url http://127.0.0.1:8545 --rpc-timeout 2 evm_revert "$snap" >/dev/null',
    );
  }
  const scriptText = script.join("\n");
  const directory = await mkdtemp(join(tmpdir(), "patchbond-run-"));
  const name = `patchbond-run-${randomUUID()}`;
  const docker =
    input.dockerBinary ??
    (existsSync("/Applications/Docker.app/Contents/Resources/bin/docker")
      ? "/Applications/Docker.app/Contents/Resources/bin/docker"
      : "docker");
  try {
    await chmod(directory, 0o755);
    await writeFile(join(directory, "run.sh"), scriptText, { mode: 0o644 });
    const args = containerArguments(RUNNER_IMAGE, name);
    const entry = args.indexOf("--entrypoint=forge");
    args[entry] = "--entrypoint=/usr/bin/timeout";
    args.splice(
      entry,
      0,
      "--mount",
      `type=bind,src=${directory},dst=/work,readonly`,
    );
    args.pop();
    args.push(
      "--signal=TERM",
      "--kill-after=2s",
      String(Math.max(1, Math.ceil(timeoutMs / 1000))),
      "/bin/sh",
      "/work/run.sh",
    );
    const result = await runBoundedProcess(
      docker,
      args,
      {
        timeoutMs,
        maxOutputBytes: 32768,
      },
      input.signal,
    );
    if (result.status !== "completed")
      return fail(
        "unknown",
        `EXECUTION_${result.status.toUpperCase().replaceAll("-", "_")}`,
      );
    const responses: Record<string, { success: boolean; data: Hex }> = {};
    for (const line of result.stdout.trim().split("\n")) {
      const match =
        /^PB_RESULT_(context|source|original|valid-quote|stale-rejected)=(.+)$/.exec(
          line,
        );
      if (!match?.[1] || !match[2] || responses[match[1]])
        return fail("unknown", "INVALID_EXECUTION_OUTPUT");
      const encoded = JSON.parse(match[2]) as Hex;
      const [success, data] = decodeAbiParameters(
        [{ type: "bool" }, { type: "bytes" }],
        encoded,
      );
      responses[match[1]] = { success, data };
    }
    if (Object.keys(responses).length !== 5)
      return fail("unknown", "INCOMPLETE_EXECUTION_OUTPUT");
    const context = responses.context;
    if (!context?.success) return fail("unknown", "REPLAY_CONTEXT_MISMATCH");
    const [actualTime, actualChain] = decodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      context.data,
    );
    if (
      actualTime !== timestamp ||
      actualChain !== BigInt(inspection.snapshot.chainId)
    )
      return fail("unknown", "REPLAY_CONTEXT_MISMATCH");
    const trace = {
      ...base.trace,
      scriptDigest: keccak256(toHex(scriptText)),
      responses,
    };
    const evidenceRef = canonicalHash({ trace, interventions });
    const assertions: InspectionAssertion[] = interventions.map((s) => ({
      id: s.id,
      outcome:
        responses[s.id]?.success && responses[s.id]?.data === "0x"
          ? "pass"
          : "fail",
      expected:
        s.id === "valid-quote"
          ? `quote ${amount} equals ${expected}`
          : "exact StalePrice(timestamp,maxAge) revert",
      observed: JSON.stringify(responses[s.id]),
      evidenceRef,
    }));
    return {
      ...base,
      status: "completed",
      reason: null,
      assertions,
      interventions,
      trace,
    };
  } catch {
    return fail("unknown", "INVALID_EXECUTION_OUTPUT");
  } finally {
    await runBoundedProcess(docker, ["rm", "--force", name], {
      timeoutMs: 5000,
      maxOutputBytes: 1024,
    });
    await rm(directory, { recursive: true, force: true });
  }
}
