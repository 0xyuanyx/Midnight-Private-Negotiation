import assert from "node:assert/strict";
import test from "node:test";
import {
  PROTOCOL_VERSION,
  createDemoEvent,
  parseDemoEvent,
  parseRuntimeCommand,
} from "../dist/index.js";

test("accepts room and limit commands and rejects a command for the wrong process", () => {
  const command = {
    protocolVersion: PROTOCOL_VERSION,
    type: "JOIN_ROOM",
    requestId: "request-1",
    target: "buyer",
    sessionId: "session-1",
    productCode: "4821",
  };

  assert.equal(parseRuntimeCommand(command, "buyer").target, "buyer");
  assert.throws(() => parseRuntimeCommand(command, "seller"), /target/);

  assert.equal(
    parseRuntimeCommand(
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "SET_LIMIT",
        requestId: "request-2",
        target: "buyer",
        sessionId: "session-1",
        limitKrw: "110000",
      },
      "buyer",
    ).type,
    "SET_LIMIT",
  );
});

test("rejects secret-bearing or premature amount fields in display events", () => {
  const base = createDemoEvent({
    panel: "buyer",
    sessionId: "session-1",
    state: "NEGOTIATING",
    messageCode: "NEGOTIATION_ACTIVE",
    audience: "PARTICIPANTS",
  });

  assert.throws(
    () => parseDemoEvent({ ...base, buyerLimit: "110000" }),
    /invalid demo event/,
  );
  assert.throws(
    () => parseDemoEvent({ ...base, publicAmount: "100000" }),
    /settled/,
  );
});

test("allows the final amount only in a settled event", () => {
  const event = createDemoEvent({
    panel: "observer",
    sessionId: "session-1",
    state: "SETTLED",
    messageCode: "SETTLEMENT_RECORDED",
    audience: "PUBLIC",
    publicAmount: "100000",
  });

  assert.equal(event.publicAmount, "100000");
});

test("requires Observer events to use the public audience", () => {
  assert.throws(
    () =>
      createDemoEvent({
        panel: "observer",
        sessionId: "session-1",
        state: "WAITING_PEER",
        messageCode: "OBSERVER_WAITING",
        audience: "ROLE_LOCAL",
      }),
    /public audience/,
  );
});
