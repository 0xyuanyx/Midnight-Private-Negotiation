import { homedir } from "node:os";
import { join, resolve } from "node:path";

export * from "./evidence.js";
export * from "./finalize.js";
export * from "./key-store.js";

// Local data for evidence, session records and private state. Kept outside
// the repository so a clone or commit never carries it.
export const resolveDataDir = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string =>
  resolve(
    environment.NEGOTIATION_DATA_DIR?.trim() ||
      join(homedir(), ".midnight-private-negotiation"),
  );
