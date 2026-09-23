import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  Negotiation,
  hexToBytes,
  priceCommitment,
} from "@midnight-negotiation/negotiation-contract";
import {
  NEGOTIATION_CONTRACT_VERSION,
  evidenceDirectory,
  evidencePath,
  loadEvidence,
  saveEvidence,
  writeFileAtomic,
  type SettlementEvidence,
} from "./evidence.js";
import type { KeyStoreMode, PartyRole } from "./key-store.js";

export type PublicDealState = {
  dealId: Uint8Array;
  priceCommitment: Uint8Array;
  status: number;
};
export type ReadDealState = (contractAddress: string) => Promise<PublicDealState>;

export type EvidenceCheck =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "WRONG_NETWORK"
        | "WRONG_CONTRACT_VERSION"
        | "EVIDENCE_INCONSISTENT"
        | "NOT_INDEXED"
        | "DEAL_MISMATCH"
        | "NOT_SETTLED"
        | "COMMITMENT_MISMATCH";
    };

const toHex = (value: Uint8Array): string => Buffer.from(value).toString("hex");

// Checks the evidence against itself and against the public chain state:
// network, contract version, deal, SETTLED status, and the price commitment.
export const verifyEvidence = async (input: {
  evidence: SettlementEvidence;
  network: string;
  readDealState: ReadDealState;
}): Promise<EvidenceCheck> => {
  const { evidence } = input;
  if (evidence.network !== input.network) return { ok: false, reason: "WRONG_NETWORK" };
  if (evidence.contractVersion !== NEGOTIATION_CONTRACT_VERSION) {
    return { ok: false, reason: "WRONG_CONTRACT_VERSION" };
  }
  const recomputed = toHex(
    priceCommitment(
      hexToBytes(evidence.dealId),
      BigInt(evidence.agreedPrice),
      hexToBytes(evidence.priceRandomness),
    ),
  );
  if (recomputed !== evidence.priceCommitment) {
    return { ok: false, reason: "EVIDENCE_INCONSISTENT" };
  }
  let state: PublicDealState;
  try {
    state = await input.readDealState(evidence.contractAddress);
  } catch {
    return { ok: false, reason: "NOT_INDEXED" };
  }
  if (toHex(state.dealId) !== evidence.dealId) return { ok: false, reason: "DEAL_MISMATCH" };
  if (state.status !== Negotiation.DealStatus.SETTLED) {
    return { ok: false, reason: "NOT_SETTLED" };
  }
  if (toHex(state.priceCommitment) !== evidence.priceCommitment) {
    return { ok: false, reason: "COMMITMENT_MISMATCH" };
  }
  return { ok: true };
};

export type SessionPhase = "ACTIVE" | "EVIDENCE_SAVED" | "CLEANED";

// A session record holds only public identifiers and store locations, so it
// can survive a crash and let the next start finish or clean the session.
export type SessionRecord = {
  role: PartyRole;
  sessionId: string;
  network: string;
  privateStateDb: string;
  storeName: string;
  accountId: string;
  contractAddress?: string;
  dealId?: string;
  phase: SessionPhase;
  updatedAt: string;
};

const sessionDirectory = (dataDir: string): string => join(dataDir, "sessions");

export const writeSessionRecord = async (
  dataDir: string,
  record: SessionRecord,
): Promise<void> => {
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(record.sessionId)) {
    throw new Error("invalid session identifier");
  }
  await writeFileAtomic(
    join(sessionDirectory(dataDir), `${record.role}-${record.sessionId}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
  );
};

export const readSessionRecords = async (
  dataDir: string,
  role?: PartyRole,
): Promise<SessionRecord[]> => {
  let names: string[];
  try {
    names = await readdir(sessionDirectory(dataDir));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: SessionRecord[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const record = JSON.parse(
      await readFile(join(sessionDirectory(dataDir), name), "utf8"),
    ) as SessionRecord;
    if (role === undefined || record.role === role) records.push(record);
  }
  return records;
};

export type SettlementOpening = { price: bigint; priceRandomness: Uint8Array };

// The role's private state store for one session. `erase` removes the
// private state (limits, keys, price opening) and the contract signing key.
export type SessionStore = {
  readOpening(): Promise<SettlementOpening | undefined>;
  erase(): Promise<void>;
};

export type FinalizeOutcome =
  | { kind: "SETTLED_EVIDENCE_SAVED"; path: string }
  | { kind: "CANCELLED_CLEANED" }
  | { kind: "ALREADY_CLEANED" }
  | {
      kind: "KEPT";
      reason:
        | "NO_CONTRACT"
        | "CHAIN_UNAVAILABLE"
        | "NOT_FINAL"
        | "NO_OPENING"
        | "EVIDENCE_REJECTED";
    };

export const finalizeSession = async (input: {
  record: SessionRecord;
  dataDir: string;
  network: string;
  readDealState: ReadDealState;
  openStore: (record: SessionRecord) => SessionStore;
  evidenceKey: Buffer;
  keyStore: KeyStoreMode;
  now?: () => Date;
}): Promise<FinalizeOutcome> => {
  const { record } = input;
  if (record.phase === "CLEANED") return { kind: "ALREADY_CLEANED" };
  if (record.contractAddress === undefined) return { kind: "KEPT", reason: "NO_CONTRACT" };
  const contractAddress = record.contractAddress;

  // The chain decides the outcome. A caller's claim is never enough to treat
  // an open or authorized deal as final.
  let state: PublicDealState;
  try {
    state = await input.readDealState(contractAddress);
  } catch {
    return { kind: "KEPT", reason: "CHAIN_UNAVAILABLE" };
  }
  const store = input.openStore(record);
  const markCleaned = async () => {
    await store.erase();
    await writeSessionRecord(input.dataDir, {
      ...record,
      phase: "CLEANED",
      updatedAt: (input.now?.() ?? new Date()).toISOString(),
    });
  };

  if (state.status === Negotiation.DealStatus.CANCELLED) {
    await markCleaned();
    return { kind: "CANCELLED_CLEANED" };
  }
  if (state.status !== Negotiation.DealStatus.SETTLED) {
    return { kind: "KEPT", reason: "NOT_FINAL" };
  }

  const path = evidencePath(input.dataDir, record.role, contractAddress);
  const check = async (evidence: SettlementEvidence) =>
    verifyEvidence({ evidence, network: input.network, readDealState: input.readDealState });

  let savedPath: string | undefined;
  try {
    const existing = await loadEvidence(path, input.evidenceKey);
    if ((await check(existing)).ok) savedPath = path;
  } catch {
    // Missing or unreadable evidence is rebuilt from the private state below.
  }

  if (savedPath === undefined) {
    const opening = await store.readOpening();
    if (opening === undefined) return { kind: "KEPT", reason: "NO_OPENING" };
    const dealId = record.dealId ?? toHex(state.dealId);
    const evidence: SettlementEvidence = {
      role: record.role,
      network: input.network,
      contractVersion: NEGOTIATION_CONTRACT_VERSION,
      contractAddress,
      dealId,
      agreedPrice: opening.price.toString(),
      priceRandomness: toHex(opening.priceRandomness),
      priceCommitment: toHex(
        priceCommitment(hexToBytes(dealId), opening.price, opening.priceRandomness),
      ),
      settledAt: (input.now?.() ?? new Date()).toISOString(),
    };
    if (!(await check(evidence)).ok) return { kind: "KEPT", reason: "EVIDENCE_REJECTED" };
    savedPath = await saveEvidence({
      dataDir: input.dataDir,
      evidence,
      key: input.evidenceKey,
      keyStore: input.keyStore,
    });
    // Only a decrypted copy that still matches the chain unlocks the cleanup.
    if (!(await check(await loadEvidence(savedPath, input.evidenceKey))).ok) {
      return { kind: "KEPT", reason: "EVIDENCE_REJECTED" };
    }
  }

  await writeSessionRecord(input.dataDir, {
    ...record,
    phase: "EVIDENCE_SAVED",
    updatedAt: (input.now?.() ?? new Date()).toISOString(),
  });
  await markCleaned();
  return { kind: "SETTLED_EVIDENCE_SAVED", path: savedPath };
};

// Runs at start-up: removes partial evidence writes and finishes every
// session a crash or error left open, keeping anything the chain has not
// finalized.
export const recoverSessions = async (input: {
  dataDir: string;
  role: PartyRole;
  network: string;
  readDealState: ReadDealState;
  openStore: (record: SessionRecord) => SessionStore;
  evidenceKey: Buffer;
  keyStore: KeyStoreMode;
  skipSessionId?: string;
}): Promise<Array<{ sessionId: string; outcome: FinalizeOutcome }>> => {
  try {
    for (const name of await readdir(evidenceDirectory(input.dataDir))) {
      if (name.startsWith(`.${input.role}-`) && name.endsWith(".tmp")) {
        await rm(join(evidenceDirectory(input.dataDir), name), { force: true });
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const results: Array<{ sessionId: string; outcome: FinalizeOutcome }> = [];
  for (const record of await readSessionRecords(input.dataDir, input.role)) {
    if (record.phase === "CLEANED" || record.sessionId === input.skipSessionId) continue;
    results.push({
      sessionId: record.sessionId,
      outcome: await finalizeSession({ ...input, record }),
    });
  }
  return results;
};
