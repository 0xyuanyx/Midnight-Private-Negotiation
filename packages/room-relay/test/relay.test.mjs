import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  RoomRelayClient,
  decryptRelayPayload,
  encryptRelayPayload,
  parseRelayClientMessage,
} from "../dist/index.js";

const relayEntry = fileURLToPath(new URL("../dist/server.js", import.meta.url));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const startRelay = async () => {
  const buyerToken = randomBytes(32).toString("hex");
  const sellerToken = randomBytes(32).toString("hex");
  const child = fork(relayEntry, [], {
    env: {
      PATH: process.env.PATH,
      ROOM_RELAY_PORT: "0",
      BUYER_RELAY_TOKEN: buyerToken,
      SELLER_RELAY_TOKEN: sellerToken,
    },
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  const ready = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("relay readiness timed out")),
      3_000,
    );
    child.once("message", (message) => {
      clearTimeout(timeout);
      resolve(message);
    });
    child.once("error", reject);
  });
  assert.equal(ready.type, "RELAY_READY");
  return {
    child,
    host: ready.host,
    port: ready.port,
    buyerToken,
    sellerToken,
  };
};

const stopRelay = async (child) => {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill();
      resolve();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.send({ type: "SHUTDOWN_RELAY" });
  });
};

test("binds room metadata into AES-GCM and exposes no plaintext field", () => {
  const sharedKey = randomBytes(32);
  const packet = encryptRelayPayload({
    sharedKey,
    metadata: {
      sessionId: "room-4821",
      productCode: "4821",
      sender: "buyer",
      target: "seller",
      sequence: 1,
    },
    payload: { kind: "proposal", round: 1, price: "100000" },
  });

  assert.deepEqual(decryptRelayPayload({ sharedKey, packet }), {
    kind: "proposal",
    round: 1,
    price: "100000",
  });
  assert.equal(JSON.stringify(packet).includes("100000"), false);
  assert.throws(
    () =>
      decryptRelayPayload({
        sharedKey,
        packet: { ...packet, productCode: "7392" },
      }),
    /authenticate|Unsupported state/i,
  );
  const changedCiphertext = Buffer.from(packet.ciphertext, "base64");
  changedCiphertext[0] ^= 1;
  assert.throws(
    () =>
      decryptRelayPayload({
        sharedKey,
        packet: {
          ...packet,
          ciphertext: changedCiphertext.toString("base64"),
        },
      }),
    /authenticate|Unsupported state/i,
  );
});

test("rejects secret-bearing relay envelopes", () => {
  assert.throws(
    () =>
      parseRelayClientMessage({
        relayProtocolVersion: 1,
        type: "PACKET",
        sessionId: "room-4821",
        productCode: "4821",
        sender: "buyer",
        target: "seller",
        sequence: 1,
        nonce: randomBytes(12).toString("base64"),
        ciphertext: randomBytes(16).toString("base64"),
        authTag: randomBytes(16).toString("base64"),
        buyerLimit: "110000",
      }),
    /invalid encrypted relay packet/,
  );
  assert.throws(
    () =>
      parseRelayClientMessage({
        relayProtocolVersion: 1,
        type: "PACKET",
        sessionId: "room-4821",
        productCode: "4821",
        sender: "buyer",
        target: "seller",
        sequence: 1,
        nonce: randomBytes(12).toString("base64"),
        ciphertext: randomBytes(16).toString("base64"),
        authTag: randomBytes(16).toString("base64"),
        plaintext: { price: "100000" },
      }),
    /invalid encrypted relay packet/,
  );
});

test("routes ciphertext in a separate process and rejects replay or room crossover", async () => {
  const relay = await startRelay();
  const buyerPeer = deferred();
  const sellerPeer = deferred();
  const sellerPacket = deferred();
  const buyerError = deferred();
  const nonceError = deferred();
  const crossoverError = deferred();
  const clients = [];

  try {
    const buyer = new RoomRelayClient({
      host: relay.host,
      port: relay.port,
      role: "buyer",
      authToken: relay.buyerToken,
      onPeerKey: buyerPeer.resolve,
      onPacket: () => {},
      onError: (error) => {
        if (error.message.includes("NONCE_REUSED")) nonceError.resolve(error);
        else buyerError.resolve(error);
      },
    });
    const seller = new RoomRelayClient({
      host: relay.host,
      port: relay.port,
      role: "seller",
      authToken: relay.sellerToken,
      onPeerKey: sellerPeer.resolve,
      onPacket: sellerPacket.resolve,
      onError: (error) => sellerPeer.reject(error),
    });
    clients.push(buyer, seller);
    await buyer.register({
      sessionId: "room-4821",
      productCode: "4821",
      publicKey: Buffer.from("buyer-public-key").toString("base64"),
    });
    await seller.register({
      sessionId: "room-4821",
      productCode: "4821",
      publicKey: Buffer.from("seller-public-key").toString("base64"),
    });
    assert.equal((await buyerPeer.promise).role, "seller");
    assert.equal((await sellerPeer.promise).role, "buyer");

    const packet = encryptRelayPayload({
      sharedKey: randomBytes(32),
      metadata: {
        sessionId: "room-4821",
        productCode: "4821",
        sender: "buyer",
        target: "seller",
        sequence: 1,
      },
      payload: { kind: "proposal", round: 1, price: "100000" },
    });
    buyer.sendPacket(packet);
    assert.deepEqual(await sellerPacket.promise, packet);
    buyer.sendPacket(packet);
    assert.match((await buyerError.promise).message, /REPLAY_REJECTED/);
    buyer.sendPacket({ ...packet, sequence: 2 });
    assert.match((await nonceError.promise).message, /NONCE_REUSED/);

    const buyerOther = new RoomRelayClient({
      host: relay.host,
      port: relay.port,
      role: "buyer",
      authToken: relay.buyerToken,
      onPeerKey: () => {},
      onPacket: () => {},
      onError: () => {},
    });
    const sellerOther = new RoomRelayClient({
      host: relay.host,
      port: relay.port,
      role: "seller",
      authToken: relay.sellerToken,
      onPeerKey: () => {},
      onPacket: () => {},
      onError: crossoverError.resolve,
    });
    clients.push(buyerOther, sellerOther);
    await buyerOther.register({
      sessionId: "room-cross",
      productCode: "4821",
      publicKey: Buffer.from("buyer-other-key").toString("base64"),
    });
    await sellerOther.register({
      sessionId: "room-cross",
      productCode: "7392",
      publicKey: Buffer.from("seller-other-key").toString("base64"),
    });
    assert.match((await crossoverError.promise).message, /ROOM_MISMATCH/);

    assert.notEqual(relay.child.pid, process.pid);
  } finally {
    for (const client of clients) client.close();
    await stopRelay(relay.child);
  }
});
