import {
  PROTOCOL_VERSION,
  createDemoEvent,
  parseRuntimeCommand,
  type RuntimeMessage,
} from "@midnight-negotiation/protocol";
import type { MidnightLocalConfig } from "@midnight-negotiation/midnight-adapter";

const role = "observer" as const;
const chainMode = process.env.MIDNIGHT_MODE === "local";
let sessionId: string | undefined;
let productCode: string | undefined;
const activeObservations = new Set<string>();

const send = (message: RuntimeMessage): void => {
  if (process.send === undefined) throw new Error("observer runtime requires an IPC parent");
  process.send(message);
};

const emit = (
  state: Parameters<typeof createDemoEvent>[0]["state"],
  messageCode: string,
  options: { occurredAt?: string; publicAmount?: string } = {},
): void => {
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
      ...options,
      ...(state === "ROOM_JOINED" && productCode !== undefined ? { productCode } : {}),
    }),
  });
};

const readChainConfig = (): Pick<MidnightLocalConfig, "indexer" | "indexerWS"> => {
  const value = JSON.parse(process.env.MIDNIGHT_CONFIG ?? "") as Partial<MidnightLocalConfig>;
  if (typeof value.indexer !== "string" || typeof value.indexerWS !== "string") {
    throw new Error("observer Midnight Indexer configuration is missing");
  }
  return { indexer: value.indexer, indexerWS: value.indexerWS };
};

const wait = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

const observeChainState = async (input: {
  sessionId: string;
  contractAddress: string;
  expectedState: "OPEN" | "AUTHORIZED" | "SETTLED" | "CANCELLED";
}): Promise<void> => {
  if (sessionId !== input.sessionId) {
    throw new Error("observer chain state session does not match");
  }
  const observationKey = `${input.contractAddress}:${input.expectedState}`;
  if (activeObservations.has(observationKey)) return;
  activeObservations.add(observationKey);
  try {
    const adapter = await import("@midnight-negotiation/midnight-adapter");
    adapter.useUndeployedNetwork();
    const expectedStatus = {
      OPEN: 1,
      AUTHORIZED: 2,
      SETTLED: 3,
      CANCELLED: 4,
    }[input.expectedState];
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      try {
        const ledger = await adapter.queryPublicState(
          readChainConfig(),
          input.contractAddress,
        );
        const status = Number(ledger.status);
        const reached =
          input.expectedState === "CANCELLED"
            ? status === expectedStatus
            : status >= expectedStatus && status !== 4;
        if (reached) {
          emit(input.expectedState, `OBSERVER_${input.expectedState}`, {
            ...(input.expectedState === "SETTLED"
              ? { publicAmount: ledger.finalPrice.toString() }
              : {}),
          });
          return;
        }
      } catch {
        // Deployment can be finalized before the Indexer exposes its state.
      }
      await wait(500);
    }
    throw new Error(`Indexer did not expose ${input.expectedState} in time`);
  } finally {
    activeObservations.delete(observationKey);
  }
};

send({ protocolVersion: PROTOCOL_VERSION, type: "RUNTIME_READY", role, pid: process.pid });

process.on("message", (raw: unknown) => {
  try {
    const command = parseRuntimeCommand(raw, role);
    switch (command.type) {
      case "CONFIGURE_OBSERVER":
        sessionId = command.sessionId;
        productCode = command.productCode;
        break;
      case "PUBLISH_PUBLIC_STATE":
        if (chainMode) {
          throw new Error("mock public-state publication is disabled in chain mode");
        }
        if (sessionId !== command.sessionId) {
          throw new Error("observer public state session does not match");
        }
        emit(command.state, command.messageCode, {
          occurredAt: command.occurredAt,
          ...(command.publicAmount === undefined
            ? {}
            : { publicAmount: command.publicAmount }),
        });
        break;
      case "OBSERVE_CHAIN_STATE":
        if (!chainMode) {
          throw new Error("chain observation is disabled in mock mode");
        }
        void observeChainState(command).catch(() => {
          if (sessionId !== undefined) {
            emit("ERROR", "CHAIN_OPERATION_FAILED");
          }
        });
        break;
      case "START_RUNTIME":
        if (sessionId === undefined) {
          throw new Error("observer runtime is not configured");
        }
        break;
      case "SHUTDOWN_RUNTIME":
        if (sessionId !== undefined) emit("STOPPED", "RUNTIME_STOPPED");
        productCode = undefined;
        sessionId = undefined;
        activeObservations.clear();
        setImmediate(() => process.disconnect());
        break;
      case "JOIN_ROOM":
      case "SET_LIMIT":
      case "PEER_READY":
      case "CHAIN_FUNDED":
        throw new Error("party command reached observer runtime");
    }
  } catch {
    if (sessionId !== undefined) emit("ERROR", "INVALID_RUNTIME_COMMAND");
  }
});
