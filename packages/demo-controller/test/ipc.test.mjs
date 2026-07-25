import assert from "node:assert/strict";
import test from "node:test";
import { IsolatedRuntimeController } from "../dist/index.js";

const waitFor = (controller, predicate, timeoutMs = 2_000) =>
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

test("runs Buyer, Seller, and Observer in isolated processes and exchanges sanitized events", async () => {
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

    const buyerJoined = waitFor(
      controller,
      (event) => event.panel === "buyer" && event.state === "ROOM_JOINED",
    );
    controller.joinRoom("buyer", {
      sessionId: "session-4821",
      productCode: "4821",
    });
    await buyerJoined;

    const sellerJoined = waitFor(
      controller,
      (event) => event.panel === "seller" && event.state === "ROOM_JOINED",
    );
    controller.joinRoom("seller", {
      sessionId: "session-4821",
      productCode: "4821",
    });
    await sellerJoined;

    const observerJoined = waitFor(
      controller,
      (event) => event.panel === "observer" && event.state === "ROOM_JOINED",
    );
    controller.configureObserver({
      sessionId: "session-4821",
      productCode: "4821",
    });
    await observerJoined;

    const buyerWaiting = waitFor(
      controller,
      (event) => event.panel === "buyer" && event.state === "WAITING_PEER",
    );
    controller.setLimit("buyer", {
      sessionId: "session-4821",
      limitKrw: "110000",
    });
    const buyerWaitingEvent = await buyerWaiting;
    assert.equal(buyerWaitingEvent.messageCode, "WAITING_FOR_PEER_INPUT");
    assert.equal(buyerWaitingEvent.audience, "ROLE_LOCAL");
    assert.equal(events.some((event) => event.state === "PEER_READY"), false);

    const sellerWaiting = waitFor(
      controller,
      (event) => event.panel === "seller" && event.state === "WAITING_PEER",
    );
    const buyerPeerReady = waitFor(
      controller,
      (event) => event.panel === "buyer" && event.state === "PEER_READY",
    );
    const sellerPeerReady = waitFor(
      controller,
      (event) => event.panel === "seller" && event.state === "PEER_READY",
    );
    controller.setLimit("seller", {
      sessionId: "session-4821",
      limitKrw: "95000",
    });
    await Promise.all([sellerWaiting, buyerPeerReady, sellerPeerReady]);

    const buyerNegotiating = waitFor(
      controller,
      (event) => event.panel === "buyer" && event.state === "NEGOTIATING",
    );
    const sellerNegotiating = waitFor(
      controller,
      (event) => event.panel === "seller" && event.state === "NEGOTIATING",
    );
    const observerWaiting = waitFor(
      controller,
      (event) => event.panel === "observer" && event.state === "WAITING_PEER",
    );
    controller.startNegotiation();
    await Promise.all([buyerNegotiating, sellerNegotiating, observerWaiting]);

    const serialized = JSON.stringify(events);
    assert.equal(serialized.includes("110000"), false);
    assert.equal(serialized.includes("95000"), false);
    assert.equal(serialized.includes("limitKrw"), false);
    assert.ok(events.every((event) => event.protocolVersion === 1));
    assert.ok(
      events
        .filter(
          (event) =>
            event.panel !== "observer" &&
            (event.state === "LIMIT_LOCKED" || event.state === "WAITING_PEER"),
        )
        .every((event) => event.audience === "ROLE_LOCAL"),
    );
    assert.ok(
      events
        .filter((event) => event.state === "PEER_READY" || event.state === "NEGOTIATING")
        .every((event) => event.audience === "PARTICIPANTS"),
    );
    assert.ok(
      events
        .filter((event) => event.panel === "observer")
        .every((event) => event.audience === "PUBLIC"),
    );
  } finally {
    unsubscribe();
    await controller.shutdown();
  }
});
