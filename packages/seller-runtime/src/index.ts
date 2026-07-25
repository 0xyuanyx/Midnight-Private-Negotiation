import {
  PROTOCOL_VERSION,
  createDemoEvent,
  parseRuntimeCommand,
  type EventAudience,
  type RuntimeMessage,
} from "@midnight-negotiation/protocol";

const role = "seller" as const;
let sessionId: string | undefined;
let productCode: string | undefined;
let sellerMinPrice: bigint | undefined;
let peerReady = false;

const send = (message: RuntimeMessage): void => {
  if (process.send === undefined) throw new Error("seller runtime requires an IPC parent");
  process.send(message);
};

const emit = (
  state: Parameters<typeof createDemoEvent>[0]["state"],
  messageCode: string,
  audience: EventAudience,
): void => {
  if (sessionId === undefined) throw new Error("seller runtime is not configured");
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
        sellerMinPrice = undefined;
        peerReady = false;
        emit("ROOM_JOINED", "SELLER_ROOM_JOINED", "PARTICIPANTS");
        break;
      case "SET_LIMIT":
        if (sessionId !== command.sessionId || productCode === undefined) {
          throw new Error("seller room is not configured");
        }
        sellerMinPrice = BigInt(command.limitKrw);
        emit("LIMIT_LOCKED", "SELLER_LIMIT_LOCKED", "ROLE_LOCAL");
        emit("WAITING_PEER", "WAITING_FOR_PEER_INPUT", "ROLE_LOCAL");
        break;
      case "PEER_READY":
        if (sessionId !== command.sessionId || sellerMinPrice === undefined) {
          throw new Error("seller limit is not configured");
        }
        peerReady = true;
        emit("PEER_READY", "BOTH_LIMITS_LOCKED", "PARTICIPANTS");
        break;
      case "START_RUNTIME":
        if (sellerMinPrice === undefined || !peerReady) throw new Error("seller peer is not ready");
        emit("NEGOTIATING", "NEGOTIATION_ACTIVE", "PARTICIPANTS");
        break;
      case "SHUTDOWN_RUNTIME":
        if (sessionId !== undefined) emit("STOPPED", "RUNTIME_STOPPED", "ROLE_LOCAL");
        sellerMinPrice = undefined;
        peerReady = false;
        productCode = undefined;
        sessionId = undefined;
        setImmediate(() => process.disconnect());
        break;
      case "CONFIGURE_OBSERVER":
        throw new Error("observer command reached seller runtime");
    }
  } catch {
    if (sessionId !== undefined) emit("ERROR", "INVALID_RUNTIME_COMMAND", "ROLE_LOCAL");
  }
});
