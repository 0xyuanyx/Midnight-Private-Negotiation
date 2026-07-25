import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createRoomSessionId,
  IsolatedRuntimeController,
} from "../dist/index.js";

const waitFor = (controller, predicate, timeoutMs = 7_000) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("timed out waiting for demo event"));
    }, timeoutMs);
    const unsubscribe = controller.onDemoEvent((event) => {
      if (!predicate(event)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(event);
    });
  });

test("scopes identical product codes to one browser demo instance", () => {
  const first = createRoomSessionId(
    "1111",
    "12345678-1234-1234-1234-123456789abc",
  );
  const second = createRoomSessionId(
    "1111",
    "abcdefab-1234-1234-1234-123456789abc",
  );

  assert.equal(first, "room-1111-12345678-1234-1234-1234-123456789abc");
  assert.notEqual(first, second);
});

test("streams the private negotiation flow from three isolated runtimes", async () => {
  const controller = new IsolatedRuntimeController();
  const events = [];
  const unsubscribe = controller.onDemoEvent((event) => events.push(event));

  try {
    const identities = await controller.start();
    assert.deepEqual(
      identities.map(({ role }) => role).sort(),
      ["buyer", "observer", "seller"],
    );
    assert.equal(new Set(identities.map(({ pid }) => pid)).size, 3);
    assert.ok(identities.every(({ pid }) => pid !== process.pid));
    const relayIdentity = controller.getRelayIdentity();
    assert.notEqual(relayIdentity.pid, process.pid);
    assert.ok(identities.every(({ pid }) => pid !== relayIdentity.pid));
    assert.equal(relayIdentity.host, "127.0.0.1");

    const buyerJoined = waitFor(
      controller,
      (event) => event.panel === "buyer" && event.state === "ROOM_JOINED",
    );
    const buyerWaitsForSeller = waitFor(
      controller,
      (event) =>
        event.panel === "buyer" && event.messageCode === "WAITING_SELLER",
    );
    controller.joinRoom("buyer", {
      sessionId: "room-4821",
      productCode: "4821",
    });
    await Promise.all([buyerJoined, buyerWaitsForSeller]);

    const sellerJoined = waitFor(
      controller,
      (event) => event.panel === "seller" && event.state === "ROOM_JOINED",
    );
    const buyerSeesSeller = waitFor(
      controller,
      (event) =>
        event.panel === "buyer" && event.messageCode === "SELLER_JOINED",
    );
    const sellerSeesBuyer = waitFor(
      controller,
      (event) =>
        event.panel === "seller" && event.messageCode === "BUYER_JOINED",
    );
    controller.joinRoom("seller", {
      sessionId: "room-4821",
      productCode: "4821",
    });
    const [, buyerPeerEvent, sellerPeerEvent] = await Promise.all([
      sellerJoined,
      buyerSeesSeller,
      sellerSeesBuyer,
    ]);
    assert.equal(buyerPeerEvent.occurredAt, sellerPeerEvent.occurredAt);
    assert.equal(buyerPeerEvent.correlationId, sellerPeerEvent.correlationId);

    const buyerLocked = waitFor(
      controller,
      (event) =>
        event.panel === "buyer" && event.messageCode === "BUYER_LIMIT_LOCKED",
    );
    const buyerCommitment = waitFor(
      controller,
      (event) =>
        event.panel === "buyer" &&
        event.messageCode === "BUYER_COMMITMENT_CREATED",
    );
    const buyerWaitsForCommitment = waitFor(
      controller,
      (event) =>
        event.panel === "buyer" &&
        event.messageCode === "WAITING_SELLER_COMMITMENT",
    );
    controller.setLimit("buyer", {
      sessionId: "room-4821",
      limitKrw: "110000",
    });
    await Promise.all([
      buyerLocked,
      buyerCommitment,
      buyerWaitsForCommitment,
    ]);

    const sellerWaitsForCommitment = waitFor(
      controller,
      (event) =>
        event.panel === "seller" &&
        event.messageCode === "WAITING_BUYER_COMMITMENT",
    );
    const buyerPeerCommitment = waitFor(
      controller,
      (event) =>
        event.panel === "buyer" &&
        event.messageCode === "SELLER_COMMITMENT_REGISTERED",
    );
    const sellerPeerCommitment = waitFor(
      controller,
      (event) =>
        event.panel === "seller" &&
        event.messageCode === "BUYER_COMMITMENT_REGISTERED",
    );
    const observerOpen = waitFor(
      controller,
      (event) =>
        event.panel === "observer" && event.messageCode === "OBSERVER_OPEN",
    );
    const buyerNegotiationStart = waitFor(
      controller,
      (event) =>
        event.panel === "buyer" &&
        event.messageCode === "NEGOTIATION_START",
    );
    const sellerNegotiationStart = waitFor(
      controller,
      (event) =>
        event.panel === "seller" &&
        event.messageCode === "NEGOTIATION_START",
    );
    const buyerNegotiating = waitFor(
      controller,
      (event) =>
        event.panel === "buyer" && event.messageCode === "NEGOTIATING",
    );
    const sellerNegotiating = waitFor(
      controller,
      (event) =>
        event.panel === "seller" && event.messageCode === "NEGOTIATING",
    );
    const observerSettled = waitFor(
      controller,
      (event) =>
        event.panel === "observer" && event.messageCode === "OBSERVER_SETTLED",
    );

    controller.setLimit("seller", {
      sessionId: "room-4821",
      limitKrw: "95000",
    });

    const [
      ,
      buyerCommitmentRegistered,
      sellerCommitmentRegistered,
      openEvent,
      buyerNegotiationStartEvent,
      sellerNegotiationStartEvent,
      buyerNegotiatingEvent,
      sellerNegotiatingEvent,
      settledEvent,
    ] = await Promise.all([
      sellerWaitsForCommitment,
      buyerPeerCommitment,
      sellerPeerCommitment,
      observerOpen,
      buyerNegotiationStart,
      sellerNegotiationStart,
      buyerNegotiating,
      sellerNegotiating,
      observerSettled,
    ]);

    assert.equal(
      buyerCommitmentRegistered.occurredAt,
      sellerCommitmentRegistered.occurredAt,
    );
    assert.equal(
      buyerNegotiationStartEvent.occurredAt,
      sellerNegotiationStartEvent.occurredAt,
    );
    assert.equal(
      buyerNegotiatingEvent.occurredAt,
      sellerNegotiatingEvent.occurredAt,
    );
    assert.ok(
      Date.parse(buyerNegotiationStartEvent.occurredAt) <
        Date.parse(buyerNegotiatingEvent.occurredAt),
    );
    assert.equal(openEvent.audience, "PUBLIC");
    assert.equal(settledEvent.publicAmount, "100000");

    const buyerProgress = events
      .filter((event) => event.panel === "buyer")
      .map((event) => event.messageCode);
    assert.ok(
      buyerProgress.indexOf("SELLER_COMMITMENT_REGISTERED") <
        buyerProgress.indexOf("NEGOTIATION_START"),
    );
    assert.ok(
      buyerProgress.indexOf("NEGOTIATION_START") <
        buyerProgress.indexOf("NEGOTIATING"),
    );
    assert.ok(
      buyerProgress.indexOf("NEGOTIATING") <
        buyerProgress.indexOf("NEGOTIATION_COMPLETE"),
    );

    const participantAgreement = events.filter(
      (event) => event.messageCode === "NEGOTIATION_SETTLED",
    );
    assert.equal(participantAgreement.length, 2);
    assert.ok(
      participantAgreement.every(
        (event) =>
          event.agreedAmount === "100000" &&
          event.audience === "PARTICIPANTS",
      ),
    );

    const serialized = JSON.stringify(events);
    assert.equal(serialized.includes("110000"), false);
    assert.equal(serialized.includes("95000"), false);
    assert.equal(serialized.includes("limitKrw"), false);
    assert.ok(events.every((event) => event.protocolVersion === 1));
    assert.ok(
      events
        .filter((event) => event.panel === "observer")
        .every(
          (event) =>
            event.audience === "PUBLIC" &&
            !["NEGOTIATING", "VERIFYING"].includes(event.state),
        ),
    );
  } finally {
    unsubscribe();
    await controller.shutdown();
  }
});

test("syncs an existing Buyer commitment before a late Seller enters a limit", async () => {
  const controller = new IsolatedRuntimeController();
  const events = [];
  const unsubscribe = controller.onDemoEvent((event) => events.push(event));

  try {
    await controller.start();
    controller.joinRoom("buyer", {
      sessionId: "room-6248",
      productCode: "6248",
    });
    await waitFor(
      controller,
      (event) =>
        event.panel === "buyer" && event.messageCode === "WAITING_SELLER",
    );

    controller.setLimit("buyer", {
      sessionId: "room-6248",
      limitKrw: "500000",
    });
    await waitFor(
      controller,
      (event) =>
        event.panel === "buyer" &&
        event.messageCode === "WAITING_SELLER_COMMITMENT",
    );

    const sellerSeesExistingCommitment = waitFor(
      controller,
      (event) =>
        event.panel === "seller" &&
        event.messageCode === "BUYER_COMMITMENT_REGISTERED",
      1_000,
    );
    controller.joinRoom("seller", {
      sessionId: "room-6248",
      productCode: "6248",
    });
    await sellerSeesExistingCommitment;

    const sellerProgressBeforeLimit = events
      .filter((event) => event.panel === "seller")
      .map((event) => event.messageCode);
    assert.ok(sellerProgressBeforeLimit.includes("BUYER_JOINED"));
    assert.ok(sellerProgressBeforeLimit.includes("BUYER_COMMITMENT_REGISTERED"));
    assert.equal(
      sellerProgressBeforeLimit.includes("WAITING_BUYER_COMMITMENT"),
      false,
    );

    const settled = waitFor(
      controller,
      (event) =>
        event.panel === "observer" && event.messageCode === "OBSERVER_SETTLED",
    );
    controller.setLimit("seller", {
      sessionId: "room-6248",
      limitKrw: "300000",
    });
    const result = await settled;
    assert.equal(result.publicAmount, "300000");
    assert.equal(
      events.some(
        (event) =>
          event.panel === "seller" &&
          event.messageCode === "WAITING_BUYER_COMMITMENT",
      ),
      false,
    );
  } finally {
    unsubscribe();
    await controller.shutdown();
  }
});

test("settles overlapping 1,000,000 and 700,000 KRW limits without an external AI key", async () => {
  const controller = new IsolatedRuntimeController();
  try {
    await controller.start();
    controller.joinRoom("buyer", {
      sessionId: "room-1111",
      productCode: "1111",
    });
    controller.joinRoom("seller", {
      sessionId: "room-1111",
      productCode: "1111",
    });
    await waitFor(
      controller,
      (event) =>
        event.panel === "seller" && event.messageCode === "BUYER_JOINED",
    );

    controller.setLimit("buyer", {
      sessionId: "room-1111",
      limitKrw: "1000000",
    });
    await waitFor(
      controller,
      (event) =>
        event.panel === "buyer" &&
        event.messageCode === "WAITING_SELLER_COMMITMENT",
    );

    const settled = waitFor(
      controller,
      (event) =>
        event.panel === "observer" && event.messageCode === "OBSERVER_SETTLED",
    );
    controller.setLimit("seller", {
      sessionId: "room-1111",
      limitKrw: "700000",
    });

    const event = await settled;
    assert.equal(event.publicAmount, "700000");
  } finally {
    await controller.shutdown();
  }
});

test("keeps relay crypto material out of the Controller and retains no limits", async () => {
  const source = await readFile(
    new URL("../dist/orchestrator.js", import.meta.url),
    "utf8",
  );

  assert.equal(source.includes("ciphertext"), false);
  assert.equal(source.includes("authTag"), false);
  assert.equal(source.includes("peerPublicKey"), false);
  assert.equal(source.includes("limitKrw"), false);
  assert.equal(source.includes("buyerMaxPrice"), false);
  assert.equal(source.includes("sellerMinPrice"), false);
});

test("skips proof and settlement states when private limits do not overlap", async () => {
  const controller = new IsolatedRuntimeController();
  const events = [];
  const unsubscribe = controller.onDemoEvent((event) => events.push(event));

  try {
    await controller.start();
    controller.joinRoom("buyer", {
      sessionId: "room-7392",
      productCode: "7392",
    });
    controller.joinRoom("seller", {
      sessionId: "room-7392",
      productCode: "7392",
    });

    await waitFor(
      controller,
      (event) =>
        event.panel === "seller" && event.messageCode === "BUYER_JOINED",
    );

    controller.setLimit("buyer", {
      sessionId: "room-7392",
      limitKrw: "90000",
    });
    await waitFor(
      controller,
      (event) =>
        event.panel === "buyer" &&
        event.messageCode === "WAITING_SELLER_COMMITMENT",
    );

    const cancelled = waitFor(
      controller,
      (event) =>
        event.panel === "buyer" &&
        event.messageCode === "NEGOTIATION_CANCELLED",
    );
    controller.setLimit("seller", {
      sessionId: "room-7392",
      limitKrw: "100000",
    });
    await cancelled;

    assert.equal(
      events.some((event) =>
        ["VERIFYING", "PROOFS_COMPLETE", "AUTHORIZED", "SETTLED"].includes(
          event.state,
        ),
      ),
      false,
    );
    assert.equal(
      events.some(
        (event) =>
          event.publicAmount !== undefined ||
          event.agreedAmount !== undefined,
      ),
      false,
    );
  } finally {
    unsubscribe();
    await controller.shutdown();
  }
});
