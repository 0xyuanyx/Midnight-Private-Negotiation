import {
  PROTOCOL_VERSION,
  createDemoEvent,
  parseRuntimeCommand,
  type RuntimeMessage,
} from "@midnight-negotiation/protocol";

const role = "observer" as const;
let sessionId: string | undefined;
let productCode: string | undefined;

const send = (message: RuntimeMessage): void => {
  if (process.send === undefined) throw new Error("observer runtime requires an IPC parent");
  process.send(message);
};

const emit = (state: Parameters<typeof createDemoEvent>[0]["state"], messageCode: string): void => {
  if (sessionId === undefined) throw new Error("observer runtime is not configured");
  send({
    protocolVersion: PROTOCOL_VERSION,
    type: "DEMO_EVENT",
    event: createDemoEvent({
      panel: role,
      sessionId,
      state,
      messageCode,
      audience: "PUBLIC",
      ...(state === "ROOM_JOINED" && productCode !== undefined ? { productCode } : {}),
    }),
  });
};

send({ protocolVersion: PROTOCOL_VERSION, type: "RUNTIME_READY", role, pid: process.pid });

process.on("message", (raw: unknown) => {
  try {
    const command = parseRuntimeCommand(raw, role);
    switch (command.type) {
      case "CONFIGURE_OBSERVER":
        sessionId = command.sessionId;
        productCode = command.productCode;
        emit("ROOM_JOINED", "OBSERVER_ROOM_JOINED");
        break;
      case "START_RUNTIME":
        if (sessionId === undefined) throw new Error("observer runtime is not configured");
        emit("WAITING_PEER", "OBSERVER_WAITING");
        break;
      case "SHUTDOWN_RUNTIME":
        if (sessionId !== undefined) emit("STOPPED", "RUNTIME_STOPPED");
        productCode = undefined;
        sessionId = undefined;
        setImmediate(() => process.disconnect());
        break;
      case "JOIN_ROOM":
      case "SET_LIMIT":
      case "PEER_READY":
        throw new Error("party command reached observer runtime");
    }
  } catch {
    if (sessionId !== undefined) emit("ERROR", "INVALID_RUNTIME_COMMAND");
  }
});
