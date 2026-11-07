import { z } from "zod";
import {
  DeploymentSchema,
  ManifestSchema,
  type RunStatus,
  RunStatusSchema,
} from "../../../packages/schema/src/types";

export { ManifestSchema, RunStatusSchema };

const reference = z.object({
  id: z.uuid(),
  name: z.string().max(128),
  createdAt: z.iso.datetime(),
});
export type RunReference = z.infer<typeof reference>;
export type Job = RunStatus;
export type Health = {
  status: string;
  schemaVersion: number;
  mode: string;
  sourceChainId: string;
  destinationChainId: string;
  contractsConfigured: boolean;
};
export function validateRunId(value: string) {
  return z.uuid().safeParse(value).success;
}
export function parseRunReferences(value: string | null): RunReference[] {
  try {
    const raw: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw
      .flatMap((item) => {
        const parsed = reference.safeParse(item);
        if (!parsed.success || seen.has(parsed.data.id)) return [];
        seen.add(parsed.data.id);
        return [parsed.data];
      })
      .slice(0, 50);
  } catch {
    return [];
  }
}
const key = (address: string) => `orryn:runs:v1:${address.toLowerCase()}`;
export function readRunReferences(address: string): RunReference[] {
  try {
    return parseRunReferences(localStorage.getItem(key(address)));
  } catch {
    return [];
  }
}
export function rememberRun(address: string, run: RunReference): boolean {
  try {
    const valid = reference.parse(run);
    localStorage.setItem(
      key(address),
      JSON.stringify(
        [
          valid,
          ...readRunReferences(address).filter((r) => r.id !== valid.id),
        ].slice(0, 50),
      ),
    );
    window.dispatchEvent(new Event("orryn:runs"));
    return true;
  } catch {
    return false;
  }
}
export function parseInventoryInput(value: unknown) {
  return z
    .strictObject({
      schemaVersion: z.literal(1),
      deployments: z.array(DeploymentSchema).min(1).max(20),
    })
    .parse(value);
}
export function friendlyError(error: unknown) {
  if (error instanceof SyntaxError)
    return "Import a valid JSON document or paste its complete contents before continuing.";
  if (error instanceof z.ZodError)
    return error.issues
      .map((issue) => `${issue.path.join(".") || "Document"}: ${issue.message}`)
      .join("; ");
  return error instanceof Error
    ? error.message
    : "The request could not be completed. Please retry.";
}
export function short(value: string, edge = 6) {
  return value.length > edge * 2 + 3
    ? `${value.slice(0, edge)}…${value.slice(-edge)}`
    : value;
}
