import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { KeyStoreMode, PartyRole } from "./key-store.js";

// Bump when the contract's public state or commitment encoding changes.
export const NEGOTIATION_CONTRACT_VERSION = "negotiation-v2.1-private-settlement";
const EVIDENCE_FORMAT = "midnight-negotiation-settlement-evidence";
const EVIDENCE_FORMAT_VERSION = 1;

// What a party keeps after settlement. It holds the price opening but never
// the private limit, the wallet seed, or a secret key.
export type SettlementEvidence = {
  role: PartyRole;
  network: string;
  contractVersion: string;
  contractAddress: string;
  dealId: string;
  agreedPrice: string;
  priceRandomness: string;
  priceCommitment: string;
  settledAt: string;
};

type EvidenceEnvelope = {
  format: typeof EVIDENCE_FORMAT;
  formatVersion: typeof EVIDENCE_FORMAT_VERSION;
  role: PartyRole;
  network: string;
  contractAddress: string;
  keyStore: KeyStoreMode;
  algorithm: "aes-256-gcm";
  nonce: string;
  tag: string;
  ciphertext: string;
};

const HEX_32 = /^[0-9a-f]{64}$/u;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  keys.every((key) => key in value) && Object.keys(value).every((key) => keys.includes(key));

const EVIDENCE_KEYS = [
  "role",
  "network",
  "contractVersion",
  "contractAddress",
  "dealId",
  "agreedPrice",
  "priceRandomness",
  "priceCommitment",
  "settledAt",
] as const;

export const parseSettlementEvidence = (value: unknown): SettlementEvidence => {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, EVIDENCE_KEYS) ||
    (value.role !== "buyer" && value.role !== "seller") ||
    typeof value.network !== "string" ||
    typeof value.contractVersion !== "string" ||
    typeof value.contractAddress !== "string" ||
    !/^[a-z0-9_]{16,256}$/u.test(value.contractAddress) ||
    typeof value.dealId !== "string" ||
    !HEX_32.test(value.dealId) ||
    typeof value.agreedPrice !== "string" ||
    !/^[1-9]\d{0,19}$/u.test(value.agreedPrice) ||
    typeof value.priceRandomness !== "string" ||
    !HEX_32.test(value.priceRandomness) ||
    typeof value.priceCommitment !== "string" ||
    !HEX_32.test(value.priceCommitment) ||
    typeof value.settledAt !== "string" ||
    Number.isNaN(Date.parse(value.settledAt))
  ) {
    throw new Error("invalid settlement evidence");
  }
  return value as SettlementEvidence;
};

const envelopeHeader = (envelope: Omit<EvidenceEnvelope, "tag" | "ciphertext">) =>
  Buffer.from(
    JSON.stringify([
      envelope.format,
      envelope.formatVersion,
      envelope.role,
      envelope.network,
      envelope.contractAddress,
      envelope.keyStore,
      envelope.algorithm,
      envelope.nonce,
    ]),
  );

export const encryptEvidence = (
  evidence: SettlementEvidence,
  key: Buffer,
  keyStore: KeyStoreMode,
): EvidenceEnvelope => {
  const parsed = parseSettlementEvidence(evidence);
  const nonce = randomBytes(12);
  const header = {
    format: EVIDENCE_FORMAT,
    formatVersion: EVIDENCE_FORMAT_VERSION,
    role: parsed.role,
    network: parsed.network,
    contractAddress: parsed.contractAddress,
    keyStore,
    algorithm: "aes-256-gcm",
    nonce: nonce.toString("base64"),
  } as const;
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(envelopeHeader(header));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(parsed), "utf8"),
    cipher.final(),
  ]);
  return {
    ...header,
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
};

// Fails on a wrong key, a modified ciphertext, or a modified header.
export const decryptEvidence = (raw: unknown, key: Buffer): SettlementEvidence => {
  if (
    !isRecord(raw) ||
    raw.format !== EVIDENCE_FORMAT ||
    raw.formatVersion !== EVIDENCE_FORMAT_VERSION ||
    raw.algorithm !== "aes-256-gcm" ||
    typeof raw.nonce !== "string" ||
    typeof raw.tag !== "string" ||
    typeof raw.ciphertext !== "string"
  ) {
    throw new Error("invalid evidence envelope");
  }
  const envelope = raw as EvidenceEnvelope;
  let plaintext: string;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(envelope.nonce, "base64"),
    );
    decipher.setAAD(envelopeHeader(envelope));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("evidence could not be decrypted: wrong key or modified file");
  }
  const evidence = parseSettlementEvidence(JSON.parse(plaintext));
  if (
    evidence.role !== envelope.role ||
    evidence.network !== envelope.network ||
    evidence.contractAddress !== envelope.contractAddress
  ) {
    throw new Error("evidence header does not match its contents");
  }
  return evidence;
};

export const evidenceDirectory = (dataDir: string): string => join(dataDir, "evidence");

export const evidencePath = (
  dataDir: string,
  role: PartyRole,
  contractAddress: string,
): string => join(evidenceDirectory(dataDir), `${role}-${contractAddress}.json`);

// Writes to a temporary file, syncs it, then renames it into place. A crash
// leaves either the old file or no file, never a partial evidence file.
export const writeFileAtomic = async (path: string, data: string): Promise<void> => {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(
    directory,
    `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  const directoryHandle = await open(directory, "r");
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
};

export const loadEvidence = async (
  path: string,
  key: Buffer,
): Promise<SettlementEvidence> =>
  decryptEvidence(JSON.parse(await readFile(path, "utf8")) as unknown, key);

const sameEvidence = (a: SettlementEvidence, b: SettlementEvidence): boolean =>
  EVIDENCE_KEYS.every((field) => a[field] === b[field]);

// Saves the evidence and reads it back through decryption before reporting
// success, so callers only delete other data after a proven round trip.
export const saveEvidence = async (input: {
  dataDir: string;
  evidence: SettlementEvidence;
  key: Buffer;
  keyStore: KeyStoreMode;
}): Promise<string> => {
  const path = evidencePath(
    input.dataDir,
    input.evidence.role,
    input.evidence.contractAddress,
  );
  await writeFileAtomic(
    path,
    `${JSON.stringify(encryptEvidence(input.evidence, input.key, input.keyStore), null, 2)}\n`,
  );
  const reread = await loadEvidence(path, input.key);
  if (!sameEvidence(reread, input.evidence)) {
    throw new Error("saved evidence does not match after reading it back");
  }
  return path;
};

export const listEvidenceFiles = async (dataDir: string): Promise<string[]> => {
  try {
    return (await readdir(evidenceDirectory(dataDir)))
      .filter((name) => name.endsWith(".json") && !name.startsWith("."))
      .map((name) => join(evidenceDirectory(dataDir), name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
};
