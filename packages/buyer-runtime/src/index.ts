import {
  PROTOCOL_VERSION,
  createDemoEvent,
  parseRuntimeCommand,
  type EventAudience,
  type RuntimeMessage,
} from "@midnight-negotiation/protocol";

const role = "buyer" as const;
let sessionId: string | undefined;
let productCode: string | undefined;
let buyerMaxPrice: bigint | undefined;
let peerReady = false;

const send = (message: RuntimeMessage): void => {
  if (process.send === undefined) throw new Error("buyer runtime requires an IPC parent");
  process.send(message);
};

const emit = (
  state: Parameters<typeof createDemoEvent>[0]["state"],
  messageCode: string,
  audience: EventAudience,
): void => {
  if (sessionId === undefined) throw new Error("buyer runtime is not configured");
  send({
    protocolVersion: PROTOCOL_VERSION,
    type: "DEMO_EVENT",
    event: createDemoEvent({
      panel: role,
      sessionId,
      state,
      messageCode,
      audience,
      ...(state === "ROOM_JOINED" && productCode !== undefined ? { productCode } : {}),
    }),
  });
};

send({ protocolVersion: PROTOCOL_VERSION, type: "RUNTIME_READY", role, pid: process.pid });

process.on("message", (raw: unknown) => {
  try {
    const command = parseRuntimeCommand(raw, role);
    switch (command.type) {
      case "JOIN_ROOM":
        sessionId = command.sessionId;
        productCode = command.productCode;
        buyerMaxPrice = undefined;
        peerReady = false;
        emit("ROOM_JOINED", "BUYER_ROOM_JOINED", "PARTICIPANTS");
        break;
      case "SET_LIMIT":
        if (sessionId !== command.sessionId || productCode === undefined) {
          throw new Error("buyer room is not configured");
        }
        buyerMaxPrice = BigInt(command.limitKrw);
        emit("LIMIT_LOCKED", "BUYER_LIMIT_LOCKED", "ROLE_LOCAL");
        emit("WAITING_PEER", "WAITING_FOR_PEER_INPUT", "ROLE_LOCAL");
        break;
      case "PEER_READY":
        if (sessionId !== command.sessionId || buyerMaxPrice === undefined) {
          throw new Error("buyer limit is not configured");
        }
        peerReady = true;
        emit("PEER_READY", "BOTH_LIMITS_LOCKED", "PARTICIPANTS");
        break;
      case "START_RUNTIME":
        if (buyerMaxPrice === undefined || !peerReady) throw new Error("buyer peer is not ready");
        emit("NEGOTIATING", "NEGOTIATION_ACTIVE", "PARTICIPANTS");
        break;
      case "SHUTDOWN_RUNTIME":
        if (sessionId !== undefined) emit("STOPPED", "RUNTIME_STOPPED", "ROLE_LOCAL");
        buyerMaxPrice = undefined;
        peerReady = false;
        productCode = undefined;
        sessionId = undefined;
        setImmediate(() => process.disconnect());
        break;
      case "CONFIGURE_OBSERVER":
        throw new Error("observer command reached buyer runtime");
    }
  } catch {
    if (sessionId !== undefined) emit("ERROR", "INVALID_RUNTIME_COMMAND", "ROLE_LOCAL");
  }
});
