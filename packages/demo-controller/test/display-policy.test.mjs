import assert from "node:assert/strict";
import test from "node:test";
import { isBrowserDisplayEvent } from "../dist/index.js";

const event = (messageCode) => ({
  protocolVersion: 1,
  eventId: `event-${messageCode.toLowerCase()}`,
  occurredAt: "2026-07-26T00:00:00.000Z",
  panel: messageCode === "DEAL_JOINED" ? "seller" : "buyer",
  sessionId: "room-4821",
  state: "COMMITMENT_CREATED",
  messageCode,
  audience: "ROLE_LOCAL",
});

test("keeps contract internals out of the browser display stream", () => {
  assert.equal(isBrowserDisplayEvent(event("DEAL_CREATED")), false);
  assert.equal(isBrowserDisplayEvent(event("DEAL_JOINED")), false);
  assert.equal(
    isBrowserDisplayEvent(event("BUYER_COMMITMENT_CREATED")),
    true,
  );
});
