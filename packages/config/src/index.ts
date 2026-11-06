import { isIP } from "node:net";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { NonzeroAddress, NonzeroHash, UInt } from "../../schema/src/types.ts";

const Chain = z.strictObject({ chainId: UInt(64), ccipSelector: UInt(64) });
export const NetworkSchema = z.strictObject({
  schemaVersion: z.literal(1),
  environment: z.enum(["local", "testnet"]),
  source: Chain,
  destination: Chain.extend({ usdc: NonzeroAddress, decimals: z.literal(6) }),
  deployments: z
    .strictObject({
      campaign: NonzeroAddress,
      sourceRegistry: NonzeroAddress,
      sourceCodeHash: NonzeroHash,
      campaignCodeHash: NonzeroHash,
      sourceDeploymentTx: NonzeroHash,
      campaignDeploymentTx: NonzeroHash,
    })
    .optional(),
});
const bounded = (min: number, max: number, fallback: number) =>
  z.preprocess(
    (v) => (v === undefined ? fallback : v),
    z.coerce.number().int().min(min).max(max),
  );
const Env = z.object({
  TRUSTED_PROXY_IPS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .refine(
      (ips) => ips.length <= 8 && ips.every((ip) => isIP(ip) > 0),
      "Only explicit trusted proxy IPs are allowed",
    ),
  PATCHBOND_MODE: z.enum(["local", "testnet"]),
  SEPOLIA_RPC_URL: z.url(),
  ARC_TESTNET_RPC_URL: z.url(),
  DATABASE_URL: z.url(),
  API_ORIGIN: z.url(),
  EVALUATOR_ADDRESS: NonzeroAddress,
  ARTIFACT_BACKEND: z.enum(["filesystem", "s3"]),
  ARTIFACT_DIRECTORY: z.string().optional(),
  ARTIFACT_BUCKET: z.string().min(3).max(63).optional(),
  ARTIFACT_REGION: z.string().min(1).optional(),
  ARTIFACT_ENDPOINT: z.url().optional(),
  API_PORT: bounded(1, 65535, 3000),
  MAX_ACTIVE_RUNS: bounded(1, 100, 5),
  MAX_INVENTORY: bounded(1, 100, 20),
  MAX_BODY_BYTES: bounded(1024, 1048576, 262144),
  LEASE_SECONDS: bounded(1, 600, 60),
  MAX_ATTEMPTS: bounded(1, 10, 3),
  SESSION_SECONDS: bounded(60, 86400, 3600),
  CHALLENGE_SECONDS: bounded(30, 600, 300),
  GLOBAL_REQUESTS_PER_MINUTE: bounded(1, 1000, 600),
  REQUESTS_PER_MINUTE: bounded(1, 1000, 60),
  MAX_ARTIFACT_BYTES: bounded(1024, 16777216, 1048576),
});
export class ConfigurationError extends Error {
  constructor(field: string) {
    super(`Invalid configuration: ${field}`);
    this.name = "ConfigurationError";
  }
}
function localHost(url: URL) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}
function checkUrl(raw: string, field: string, local: boolean) {
  const u = new URL(raw);
  if (
    u.hash ||
    !["https:", "http:"].includes(u.protocol) ||
    (!local && (u.protocol !== "https:" || localHost(u)))
  )
    throw new ConfigurationError(field);
  return u;
}
export function loadConfig(env: unknown, publicManifest: unknown) {
  const parsed = Env.safeParse(env);
  if (!parsed.success)
    throw new ConfigurationError(
      parsed.error.issues.map((i) => i.path.join(".")).join(", "),
    );
  const m = NetworkSchema.safeParse(publicManifest);
  if (!m.success) throw new ConfigurationError("network manifest");
  const e = parsed.data,
    n = m.data,
    local = e.PATCHBOND_MODE === "local";
  if (n.environment !== e.PATCHBOND_MODE)
    throw new ConfigurationError("network mode");
  if (
    !local &&
    (n.source.chainId !== "11155111" ||
      n.source.ccipSelector !== "16015286601757825753" ||
      n.destination.chainId !== "5042002" ||
      n.destination.ccipSelector !== "3034092155422581607" ||
      n.destination.usdc.toLowerCase() !==
        "0x3600000000000000000000000000000000000000")
  )
    throw new ConfigurationError("testnet chain/selector/token");
  if (
    local &&
    (!["31337", "31338"].includes(n.source.chainId) ||
      !["31337", "31338"].includes(n.destination.chainId))
  )
    throw new ConfigurationError("local chain");
  checkUrl(e.SEPOLIA_RPC_URL, "SEPOLIA_RPC_URL", local);
  checkUrl(e.ARC_TESTNET_RPC_URL, "ARC_TESTNET_RPC_URL", local);
  const origin = checkUrl(e.API_ORIGIN, "API_ORIGIN", local);
  if (
    origin.pathname !== "/" ||
    origin.search ||
    origin.username ||
    origin.password
  )
    throw new ConfigurationError("API_ORIGIN");
  if (!["postgres:", "postgresql:"].includes(new URL(e.DATABASE_URL).protocol))
    throw new ConfigurationError("DATABASE_URL");
  let artifacts:
    | { kind: "filesystem"; directory: string }
    | { kind: "s3"; bucket: string; region: string; endpoint?: string };
  if (e.ARTIFACT_BACKEND === "filesystem") {
    if (!local || !e.ARTIFACT_DIRECTORY || !isAbsolute(e.ARTIFACT_DIRECTORY))
      throw new ConfigurationError("ARTIFACT_DIRECTORY/mode");
    artifacts = { kind: "filesystem", directory: e.ARTIFACT_DIRECTORY };
  } else {
    if (!e.ARTIFACT_BUCKET || !e.ARTIFACT_REGION)
      throw new ConfigurationError("ARTIFACT_BUCKET/ARTIFACT_REGION");
    if (e.ARTIFACT_ENDPOINT)
      checkUrl(e.ARTIFACT_ENDPOINT, "ARTIFACT_ENDPOINT", local);
    artifacts = {
      kind: "s3",
      bucket: e.ARTIFACT_BUCKET,
      region: e.ARTIFACT_REGION,
      ...(e.ARTIFACT_ENDPOINT ? { endpoint: e.ARTIFACT_ENDPOINT } : {}),
    };
  }
  return {
    mode: e.PATCHBOND_MODE,
    network: n,
    rpc: { source: e.SEPOLIA_RPC_URL, destination: e.ARC_TESTNET_RPC_URL },
    databaseUrl: e.DATABASE_URL,
    origin: origin.origin,
    evaluator: e.EVALUATOR_ADDRESS,
    artifacts,
    port: e.API_PORT,
    trustedProxyIps: e.TRUSTED_PROXY_IPS,
    limits: {
      activeRuns: e.MAX_ACTIVE_RUNS,
      inventory: e.MAX_INVENTORY,
      bodyBytes: e.MAX_BODY_BYTES,
      leaseSeconds: e.LEASE_SECONDS,
      maxAttempts: e.MAX_ATTEMPTS,
      sessionSeconds: e.SESSION_SECONDS,
      challengeSeconds: e.CHALLENGE_SECONDS,
      requestsPerMinute: e.REQUESTS_PER_MINUTE,
      globalRequestsPerMinute: e.GLOBAL_REQUESTS_PER_MINUTE,
      artifactBytes: e.MAX_ARTIFACT_BYTES,
    },
    publicStatus: {
      schemaVersion: 1,
      mode: e.PATCHBOND_MODE,
      sourceChainId: n.source.chainId,
      destinationChainId: n.destination.chainId,
      contractsConfigured: !!n.deployments,
    },
  };
}
export type RuntimeConfig = ReturnType<typeof loadConfig>;
