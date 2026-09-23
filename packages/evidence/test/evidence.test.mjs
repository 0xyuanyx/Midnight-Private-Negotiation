import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  Negotiation,
  hexToBytes,
  priceCommitment,
} from "@midnight-negotiation/negotiation-contract";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import {
  NEGOTIATION_CONTRACT_VERSION,
  createFileKeyStore,
  createMacosKeychainKeyStore,
  decryptEvidence,
  encryptEvidence,
  evidencePath,
  finalizeSession,
  loadEvidence,
  privateStatePassword,
  readSessionRecords,
  recoverSessions,
  saveEvidence,
  selectKeyStore,
  verifyEvidence,
  writeSessionRecord,
} from "../dist/index.js";

const tempDir = () => mkdtemp(join(tmpdir(), "negotiation-evidence-"));
const hex = (bytes) => Buffer.from(bytes).toString("hex");
const CONTRACT = `mn_contract_undeployed1${"a".repeat(48)}`;
const DEAL_ID = "11".repeat(32);
const RANDOMNESS = "88".repeat(32);
const PRICE = 100_000_000n;
const COMMITMENT = hex(priceCommitment(hexToBytes(DEAL_ID), PRICE, hexToBytes(RANDOMNESS)));

const sampleEvidence = (overrides = {}) => ({
  role: "buyer",
  network: "undeployed",
  contractVersion: NEGOTIATION_CONTRACT_VERSION,
  contractAddress: CONTRACT,
  dealId: DEAL_ID,
  agreedPrice: PRICE.toString(),
  priceRandomness: RANDOMNESS,
  priceCommitment: COMMITMENT,
  settledAt: "2026-09-23T10:00:00.000Z",
  ...overrides,
});

const chain = (status, overrides = {}) => async (address) => {
  if (address !== CONTRACT) throw new Error("contract is not indexed");
  return {
    dealId: hexToBytes(DEAL_ID),
    priceCommitment: hexToBytes(COMMITMENT),
    status,
    ...overrides,
  };
};

const fakeStore = (opening) => {
  const store = {
    erased: 0,
    async readOpening() {
      return opening;
    },
    async erase() {
      store.erased += 1;
    },
  };
  return store;
};

const sessionRecord = (dataDir, overrides = {}) => ({
  role: "buyer",
  sessionId: "session-1",
  network: "undeployed",
  privateStateDb: join(dataDir, "private-state", "buyer"),
  storeName: "negotiation-buyer-session-1",
  accountId: "account-1",
  contractAddress: CONTRACT,
  dealId: DEAL_ID,
  phase: "ACTIVE",
  updatedAt: "2026-09-23T09:00:00.000Z",
  ...overrides,
});

test("round-trips evidence and rejects a wrong key or a modified file", async () => {
  const key = randomBytes(32);
  const envelope = encryptEvidence(sampleEvidence(), key, "file");
  assert.deepEqual(decryptEvidence(envelope, key), sampleEvidence());
  assert.equal(JSON.stringify(envelope).includes(PRICE.toString()), false);
  assert.equal(JSON.stringify(envelope).includes(RANDOMNESS), false);

  assert.throws(() => decryptEvidence(envelope, randomBytes(32)), /wrong key or modified/);
  const flipped = Buffer.from(envelope.ciphertext, "base64");
  flipped[0] ^= 1;
  assert.throws(
    () => decryptEvidence({ ...envelope, ciphertext: flipped.toString("base64") }, key),
    /wrong key or modified/,
  );
  assert.throws(
    () => decryptEvidence({ ...envelope, contractAddress: `mn_contract_undeployed1${"b".repeat(48)}` }, key),
    /wrong key or modified/,
  );
});

test("never stores a limit, a wallet seed, or a secret key in evidence", () => {
  assert.throws(() => encryptEvidence(sampleEvidence({ buyerMaxPrice: "110000000" }), randomBytes(32), "file"));
  assert.throws(() => encryptEvidence(sampleEvidence({ secretKey: "44".repeat(32) }), randomBytes(32), "file"));
});

test("verifies network, contract version, deal, SETTLED status and commitment", async () => {
  const verify = (evidence, readDealState, network = "undeployed") =>
    verifyEvidence({ evidence, network, readDealState });
  const settled = chain(Negotiation.DealStatus.SETTLED);

  assert.deepEqual(await verify(sampleEvidence(), settled), { ok: true });
  assert.equal((await verify(sampleEvidence(), settled, "testnet")).reason, "WRONG_NETWORK");
  assert.equal(
    (await verify(sampleEvidence({ contractVersion: "negotiation-v2.0" }), settled)).reason,
    "WRONG_CONTRACT_VERSION",
  );
  assert.equal(
    (await verify(sampleEvidence({ agreedPrice: "99000000" }), settled)).reason,
    "EVIDENCE_INCONSISTENT",
  );
  assert.equal(
    (await verify(sampleEvidence({ contractAddress: `mn_contract_undeployed1${"c".repeat(48)}` }), settled)).reason,
    "NOT_INDEXED",
  );
  assert.equal(
    (await verify(sampleEvidence(), chain(Negotiation.DealStatus.SETTLED, { dealId: hexToBytes("22".repeat(32)) }))).reason,
    "DEAL_MISMATCH",
  );
  assert.equal(
    (await verify(sampleEvidence(), chain(Negotiation.DealStatus.AUTHORIZED))).reason,
    "NOT_SETTLED",
  );
  assert.equal(
    (await verify(sampleEvidence(), chain(Negotiation.DealStatus.SETTLED, { priceCommitment: hexToBytes("99".repeat(32)) }))).reason,
    "COMMITMENT_MISMATCH",
  );
});

test("finalizes a settled session: evidence saved, read back, then private state erased", async () => {
  const dataDir = await tempDir();
  try {
    const key = randomBytes(32);
    const store = fakeStore({ price: PRICE, priceRandomness: hexToBytes(RANDOMNESS) });
    await writeSessionRecord(dataDir, sessionRecord(dataDir));
    const outcome = await finalizeSession({
      record: sessionRecord(dataDir),
      dataDir,
      network: "undeployed",
      readDealState: chain(Negotiation.DealStatus.SETTLED),
      openStore: () => store,
      evidenceKey: key,
      keyStore: "file",
    });
    assert.equal(outcome.kind, "SETTLED_EVIDENCE_SAVED");
    assert.equal(store.erased, 1);
    const evidence = await loadEvidence(outcome.path, key);
    assert.equal(evidence.agreedPrice, PRICE.toString());
    assert.equal(((await stat(outcome.path)).mode & 0o777).toString(8), "600");
    assert.equal((await readSessionRecords(dataDir, "buyer"))[0].phase, "CLEANED");
    const record = await readFile(join(dataDir, "sessions", "buyer-session-1.json"), "utf8");
    assert.equal(record.includes(PRICE.toString()), false);
    assert.equal(record.includes(RANDOMNESS), false);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("keeps every record of a deal the chain has not finalized", async () => {
  const dataDir = await tempDir();
  try {
    for (const [readDealState, reason] of [
      [chain(Negotiation.DealStatus.OPEN), "NOT_FINAL"],
      [chain(Negotiation.DealStatus.AUTHORIZED), "NOT_FINAL"],
      [async () => { throw new Error("indexer down"); }, "CHAIN_UNAVAILABLE"],
    ]) {
      const store = fakeStore({ price: PRICE, priceRandomness: hexToBytes(RANDOMNESS) });
      const outcome = await finalizeSession({
        record: sessionRecord(dataDir),
        dataDir,
        network: "undeployed",
        readDealState,
        openStore: () => store,
        evidenceKey: randomBytes(32),
        keyStore: "file",
      });
      assert.deepEqual(outcome, { kind: "KEPT", reason });
      assert.equal(store.erased, 0);
    }
    assert.deepEqual(await readdir(dataDir), []);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("does not save or erase when the stored opening disagrees with the chain", async () => {
  const dataDir = await tempDir();
  try {
    const store = fakeStore({ price: PRICE + 250n, priceRandomness: hexToBytes(RANDOMNESS) });
    const outcome = await finalizeSession({
      record: sessionRecord(dataDir),
      dataDir,
      network: "undeployed",
      readDealState: chain(Negotiation.DealStatus.SETTLED),
      openStore: () => store,
      evidenceKey: randomBytes(32),
      keyStore: "file",
    });
    assert.deepEqual(outcome, { kind: "KEPT", reason: "EVIDENCE_REJECTED" });
    assert.equal(store.erased, 0);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("cleans a cancelled session without writing evidence", async () => {
  const dataDir = await tempDir();
  try {
    const store = fakeStore(undefined);
    const outcome = await finalizeSession({
      record: sessionRecord(dataDir),
      dataDir,
      network: "undeployed",
      readDealState: chain(Negotiation.DealStatus.CANCELLED),
      openStore: () => store,
      evidenceKey: randomBytes(32),
      keyStore: "file",
    });
    assert.deepEqual(outcome, { kind: "CANCELLED_CLEANED" });
    assert.equal(store.erased, 1);
    assert.deepEqual(await readdir(join(dataDir)), ["sessions"]);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("recovers after a crash during the evidence write", async () => {
  const dataDir = await tempDir();
  try {
    const key = randomBytes(32);
    // State left by a crash: the session is still ACTIVE and only a partial
    // temporary file exists next to where the evidence should be.
    await writeSessionRecord(dataDir, sessionRecord(dataDir));
    const partial = join(dataDir, "evidence", `.buyer-${CONTRACT}.json.123.abc.tmp`);
    await mkdir(join(dataDir, "evidence"), { recursive: true });
    await writeFile(partial, '{"format":"midnight-negotiation-settlement-evi');
    const store = fakeStore({ price: PRICE, priceRandomness: hexToBytes(RANDOMNESS) });

    const results = await recoverSessions({
      dataDir,
      role: "buyer",
      network: "undeployed",
      readDealState: chain(Negotiation.DealStatus.SETTLED),
      openStore: () => store,
      evidenceKey: key,
      keyStore: "file",
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].outcome.kind, "SETTLED_EVIDENCE_SAVED");
    assert.deepEqual(await readdir(join(dataDir, "evidence")), [`buyer-${CONTRACT}.json`]);
    assert.equal((await loadEvidence(evidencePath(dataDir, "buyer", CONTRACT), key)).dealId, DEAL_ID);
    assert.equal(store.erased, 1);

    // A second start has nothing left to do.
    assert.deepEqual(
      await recoverSessions({
        dataDir,
        role: "buyer",
        network: "undeployed",
        readDealState: chain(Negotiation.DealStatus.SETTLED),
        openStore: () => store,
        evidenceKey: key,
        keyStore: "file",
      }),
      [],
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("recovers when evidence was saved but the cleanup did not run", async () => {
  const dataDir = await tempDir();
  try {
    const key = randomBytes(32);
    await saveEvidence({ dataDir, evidence: sampleEvidence(), key, keyStore: "file" });
    await writeSessionRecord(dataDir, sessionRecord(dataDir, { phase: "EVIDENCE_SAVED" }));
    const store = fakeStore(undefined);
    const [result] = await recoverSessions({
      dataDir,
      role: "buyer",
      network: "undeployed",
      readDealState: chain(Negotiation.DealStatus.SETTLED),
      openStore: () => store,
      evidenceKey: key,
      keyStore: "file",
    });
    assert.equal(result.outcome.kind, "SETTLED_EVIDENCE_SAVED");
    assert.equal(store.erased, 1);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("file key store is explicit, 0600, and stable across restarts", async () => {
  const dataDir = await tempDir();
  try {
    assert.throws(
      () => selectKeyStore({ dataDir, environment: {}, platform: "linux" }),
      /NEGOTIATION_KEY_STORE=file/,
    );
    assert.throws(
      () => selectKeyStore({ dataDir, environment: { NEGOTIATION_KEY_STORE: "keychain" }, platform: "linux" }),
      /requires macOS/,
    );
    assert.equal(
      selectKeyStore({ dataDir, environment: {}, platform: "darwin" }).mode,
      "macos-keychain",
    );
    const store = selectKeyStore({ dataDir, environment: { NEGOTIATION_KEY_STORE: "file" } });
    assert.equal(store.mode, "file");
    const first = await store.getOrCreateKey("seller", "evidence");
    const again = await createFileKeyStore(join(dataDir, "keys")).getOrCreateKey("seller", "evidence");
    assert.deepEqual(first, again);
    assert.notDeepEqual(first, await store.getOrCreateKey("buyer", "evidence"));
    assert.equal(((await stat(join(dataDir, "keys", "seller-evidence.key"))).mode & 0o777).toString(8), "600");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("macOS Keychain key store creates and rereads a key", { skip: process.platform !== "darwin" }, async (t) => {
  const service = `midnight-private-negotiation-test-${randomBytes(4).toString("hex")}`;
  const { execFileSync } = await import("node:child_process");
  t.after(() => {
    for (const account of ["buyer-evidence"]) {
      try {
        execFileSync("security", ["delete-generic-password", "-s", service, "-a", account], { stdio: "ignore" });
      } catch {}
    }
  });
  const store = createMacosKeychainKeyStore(service);
  assert.equal(await store.readKey("buyer", "evidence"), undefined);
  const key = await store.getOrCreateKey("buyer", "evidence");
  assert.equal(key.length, 32);
  assert.deepEqual(await store.readKey("buyer", "evidence"), key);
});

test("level private state opened with the wrong password cannot be read", async () => {
  const dataDir = await tempDir();
  try {
    const open = (password) => {
      const provider = levelPrivateStateProvider({
        midnightDbName: join(dataDir, "db"),
        privateStateStoreName: "negotiation-buyer-session-1",
        accountId: "account-1",
        privateStoragePasswordProvider: () => password,
      });
      provider.setContractAddress(CONTRACT);
      return provider;
    };
    const right = privateStatePassword(randomBytes(32));
    await open(right).set("negotiationPrivateState", { agreedPrice: PRICE });
    assert.equal((await open(right).get("negotiationPrivateState")).agreedPrice, PRICE);
    await assert.rejects(open(privateStatePassword(randomBytes(32))).get("negotiationPrivateState"));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
