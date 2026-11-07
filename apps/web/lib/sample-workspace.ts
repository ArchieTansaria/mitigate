import { z } from "zod";
/** Browser-only example data. No chain reads, signatures, or production receipts. */
export const SamplePolicySchema = z.strictObject({
  schemaVersion: z.literal(1),
  releaseId: z.string().min(1).max(80),
  approvedVersion: z.literal(2),
  maxPriceAgeSeconds: z.number().int().min(1).max(3600),
  grantUSDC: z.number().int().min(1).max(1000),
});
const DeploymentInput = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  name: z.string().min(1).max(80),
  owner: z.string().min(1).max(80),
  implementationVersion: z.number().int().min(1).max(2),
  maxPriceAgeSeconds: z.number().int().min(1).max(86400),
  acceptsFreshPrices: z.boolean(),
});
export const SampleInventorySchema = z.strictObject({
  scenario: z.literal("orryn-sample-v1"),
  deployments: z
    .array(DeploymentInput)
    .min(1)
    .max(20)
    .refine(
      (a) => new Set(a.map((d) => d.id)).size === a.length,
      "Duplicate deployment IDs",
    ),
});
export const samplePolicy = {
  schemaVersion: 1 as const,
  releaseId: "oracle-freshness-v2",
  approvedVersion: 2 as const,
  maxPriceAgeSeconds: 90,
  grantUSDC: 20,
};
export const sampleInventory = {
  scenario: "orryn-sample-v1" as const,
  deployments: [
    {
      id: "harbor",
      name: "Harbor Lending",
      owner: "Harbor multisig",
      implementationVersion: 2,
      maxPriceAgeSeconds: 90,
      acceptsFreshPrices: true,
    },
    {
      id: "bazaar",
      name: "Bazaar Credit",
      owner: "Bazaar multisig",
      implementationVersion: 2,
      maxPriceAgeSeconds: 86400,
      acceptsFreshPrices: true,
    },
    {
      id: "atlas",
      name: "Atlas Vault",
      owner: "Atlas governance",
      implementationVersion: 1,
      maxPriceAgeSeconds: 90,
      acceptsFreshPrices: true,
    },
  ],
};
export type SamplePolicy = z.infer<typeof SamplePolicySchema>;
export type SampleDeployment = z.infer<typeof DeploymentInput> & {
  revision: number;
};
export type SampleCheck = {
  name: string;
  expected: string;
  observed: string;
  pass: boolean;
};
export type SampleResult = {
  deploymentId: string;
  revision: number;
  checks: SampleCheck[];
  pass: boolean;
};
export type SampleRun = {
  id: string;
  createdAt: string;
  results: SampleResult[];
};
export type SampleClaim = "pending" | "awarded" | "paid";
export type SampleWorkspace = {
  policy: SamplePolicy | null;
  deployments: SampleDeployment[];
  runs: SampleRun[];
  campaign: {
    funded: boolean;
    closed: boolean;
    claims: Record<string, SampleClaim>;
  };
  events: string[];
};
export function emptySample(): SampleWorkspace {
  return {
    policy: null,
    deployments: [],
    runs: [],
    campaign: { funded: false, closed: false, claims: {} },
    events: [],
  };
}
export function sampleChecks(
  d: SampleDeployment,
  p: SamplePolicy,
): SampleCheck[] {
  return [
    {
      name: "Approved implementation",
      expected: `Version ${p.approvedVersion}`,
      observed: `Version ${d.implementationVersion}`,
      pass: d.implementationVersion === p.approvedVersion,
    },
    {
      name: "Maximum price age",
      expected: `≤ ${p.maxPriceAgeSeconds} seconds`,
      observed: `${d.maxPriceAgeSeconds} seconds`,
      pass: d.maxPriceAgeSeconds <= p.maxPriceAgeSeconds,
    },
    {
      name: "Stale input rejected",
      expected: `Reject price older than ${p.maxPriceAgeSeconds}s`,
      observed:
        d.implementationVersion === 2 &&
        d.maxPriceAgeSeconds <= p.maxPriceAgeSeconds
          ? "Rejected in sample model"
          : "Accepted in sample model",
      pass:
        d.implementationVersion === 2 &&
        d.maxPriceAgeSeconds <= p.maxPriceAgeSeconds,
    },
    {
      name: "Fresh input accepted",
      expected: "Normal operation preserved",
      observed: d.acceptsFreshPrices
        ? "Accepted in sample model"
        : "Application disabled",
      pass: d.acceptsFreshPrices,
    },
  ];
}
export function latestSampleResult(s: SampleWorkspace, id: string) {
  const d = s.deployments.find((d) => d.id === id);
  const result = s.runs[0]?.results.find((r) => r.deploymentId === id);
  return d && result?.revision === d.revision ? result : null;
}
export function sampleAccounting(s: SampleWorkspace) {
  const grant = s.policy?.grantUSDC ?? 0;
  const funded = s.campaign.funded ? grant * s.deployments.length : 0;
  const amounts = Object.values(s.campaign.claims);
  const reserved = amounts.filter((x) => x === "pending").length * grant;
  const awarded = amounts.filter((x) => x === "awarded").length * grant;
  const paid = amounts.filter((x) => x === "paid").length * grant;
  const free = funded - reserved - awarded - paid;
  return {
    funded,
    reserved,
    awarded,
    paid,
    unallocated: s.campaign.closed ? 0 : free,
    recovered: s.campaign.closed ? free : 0,
  };
}
export type SampleAction =
  | { type: "policy"; input: unknown }
  | { type: "inventory"; input: unknown }
  | { type: "run"; at: string }
  | { type: "repair"; id: string }
  | { type: "fund" }
  | { type: "claim" | "finalize" | "withdraw"; id: string }
  | { type: "close" };
export function updateSample(
  s: SampleWorkspace,
  a: SampleAction,
): SampleWorkspace {
  const next = structuredClone(s);
  let message = "";
  switch (a.type) {
    case "policy":
      if (s.campaign.funded)
        throw new Error(
          "Funded campaign terms are frozen. Reset the sample to change them.",
        );
      next.policy = SamplePolicySchema.parse(a.input);
      next.runs = [];
      message = `Registered policy ${next.policy.releaseId}.`;
      break;
    case "inventory":
      if (s.campaign.funded)
        throw new Error(
          "Eligibility is frozen after funding. Reset the sample to replace it.",
        );
      next.deployments = SampleInventorySchema.parse(a.input).deployments.map(
        (d) => ({ ...d, revision: 0 }),
      );
      next.runs = [];
      message = `Registered ${next.deployments.length} sample deployments.`;
      break;
    case "run": {
      if (!s.policy || !s.deployments.length)
        throw new Error("Register a policy and deployments first.");
      const results = s.deployments.map((d) => {
        const checks = sampleChecks(d, s.policy as SamplePolicy);
        return {
          deploymentId: d.id,
          revision: d.revision,
          checks,
          pass: checks.every((c) => c.pass),
        };
      });
      next.runs.unshift({
        id: `SAMPLE-${crypto.randomUUID()}`,
        createdAt: a.at,
        results,
      });
      next.runs = next.runs.slice(0, 10);
      message = `Sample verification: ${results.filter((r) => r.pass).length}/${results.length} meet the policy.`;
      break;
    }
    case "repair": {
      if (!s.policy) throw new Error("Register a policy first.");
      const d = next.deployments.find((d) => d.id === a.id);
      if (!d) throw new Error("Unknown sample deployment.");
      d.implementationVersion = s.policy.approvedVersion;
      d.maxPriceAgeSeconds = s.policy.maxPriceAgeSeconds;
      d.revision += 1;
      message = `Simulated ${d.owner} repair for ${d.name}. Fresh verification required.`;
      break;
    }
    case "fund":
      if (!s.policy || !s.deployments.length || s.campaign.funded)
        throw new Error("Register terms and eligibility before funding once.");
      next.campaign.funded = true;
      message = `Sample fund activated: ${s.policy.grantUSDC * s.deployments.length} test USDC.`;
      break;
    case "claim":
      if (!s.campaign.funded || s.campaign.closed)
        throw new Error("Sample campaign is not open and funded.");
      if (s.campaign.claims[a.id])
        throw new Error(
          "Duplicate claim rejected: this campaign/deployment already has a claim.",
        );
      if (!latestSampleResult(s, a.id)?.pass)
        throw new Error(
          "A fresh passing sample check is required. No funds reserved.",
        );
      next.campaign.claims[a.id] = "pending";
      message = `Simulated acceptance and claim for ${a.id}; allowance reserved, not paid.`;
      break;
    case "finalize":
      if (s.campaign.claims[a.id] !== "pending")
        throw new Error("No pending claim.");
      next.campaign.claims[a.id] = "awarded";
      message = `Advanced sample challenge clock; unchallenged ${a.id} claim awarded.`;
      break;
    case "withdraw":
      if (s.campaign.claims[a.id] !== "awarded")
        throw new Error("No withdrawable award.");
      next.campaign.claims[a.id] = "paid";
      message = `Simulated ${a.id} withdrawal. No real token transfer.`;
      break;
    case "close":
      if (!s.campaign.funded || s.campaign.closed)
        throw new Error("No open campaign.");
      if (sampleAccounting(s).reserved || sampleAccounting(s).awarded)
        throw new Error(
          "Settle pending and awarded sample claims before closing this walkthrough.",
        );
      next.campaign.closed = true;
      message =
        "Advanced sample campaign deadline and recovered unused allowances.";
      break;
  }
  next.events = [...next.events, message].slice(-60);
  return next;
}
// Validate saved state before rendering; malformed or old example data cannot leak into live APIs.
const CheckSchema = z.object({
  name: z.string(),
  expected: z.string(),
  observed: z.string(),
  pass: z.boolean(),
});
export const SavedSampleSchema = z.object({
  policy: SamplePolicySchema.nullable(),
  deployments: z
    .array(DeploymentInput.extend({ revision: z.number().int().nonnegative() }))
    .max(20),
  runs: z
    .array(
      z.object({
        id: z.string(),
        createdAt: z.string(),
        results: z.array(
          z.object({
            deploymentId: z.string(),
            revision: z.number().int().nonnegative(),
            checks: z.array(CheckSchema),
            pass: z.boolean(),
          }),
        ),
      }),
    )
    .max(10),
  campaign: z.object({
    funded: z.boolean(),
    closed: z.boolean(),
    claims: z.record(z.string(), z.enum(["pending", "awarded", "paid"])),
  }),
  events: z.array(z.string()).max(60),
});
