export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("Missing expected test value");
  return value;
}
