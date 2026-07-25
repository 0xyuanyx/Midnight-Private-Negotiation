import { fork, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import {
  PROTOCOL_VERSION,
  createRequestId,
  parseRuntimeCommand,
  parseRuntimeMessage,
  type DemoEvent,
  type PartyRole,
  type Role,
  type RuntimeCommand,
} from "@midnight-negotiation/protocol";

export type RuntimeIdentity = {
  role: Role;
  pid: number;
};

type RuntimeEntryMap = Record<Role, string>;

const defaultRuntimeEntries = (): RuntimeEntryMap => ({
  buyer: fileURLToPath(new URL("../../buyer-runtime/dist/index.js", import.meta.url)),
  seller: fileURLToPath(new URL("../../seller-runtime/dist/index.js", import.meta.url)),
  observer: fileURLToPath(new URL("../../observer-runtime/dist/index.js", import.meta.url)),
});

const publicProcessEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL"]) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
};

export class IsolatedRuntimeController {
  readonly #children = new Map<Role, ChildProcess>();
  readonly #identities = new Map<Role, RuntimeIdentity>();
  readonly #partyRooms = new Map<PartyRole, { sessionId: string; productCode: string }>();
  readonly #lockedSessions = new Map<PartyRole, string>();
  readonly #peerReadySessions = new Set<string>();
  readonly #events = new EventEmitter();
  readonly #entries: RuntimeEntryMap;
  #started = false;

  constructor(entries: RuntimeEntryMap = defaultRuntimeEntries()) {
    this.#entries = entries;
  }

  async start(timeoutMs = 5_000): Promise<RuntimeIdentity[]> {
    if (this.#started) throw new Error("runtime controller is already started");
    this.#started = true;

    const ready = (["buyer", "seller", "observer"] as const).map(
      (role) =>
        new Promise<RuntimeIdentity>((resolve, reject) => {
          const child = fork(this.#entries[role], [], {
            env: publicProcessEnvironment(),
            stdio: ["ignore", "ignore", "inherit", "ipc"],
          });
          this.#children.set(role, child);

          const timeout = setTimeout(() => {
            reject(new Error(`${role} runtime readiness timed out`));
          }, timeoutMs);

          child.on("message", (raw: unknown) => {
            try {
              const message = parseRuntimeMessage(raw);
              if (message.type === "RUNTIME_READY") {
                if (message.role !== role || message.pid !== child.pid || this.#identities.has(role)) {
                  throw new Error("runtime identity does not match its child process");
                }
                const identity = { role, pid: message.pid };
                this.#identities.set(role, identity);
                clearTimeout(timeout);
                resolve(identity);
                return;
              }

              if (message.event.panel !== role) {
                throw new Error("demo event panel does not match its child process");
              }
              this.#events.emit("demo-event", message.event);
              if (role !== "observer") this.#acceptPartyEvent(role, message.event);
            } catch (error) {
              this.#events.emit("controller-error", error);
            }
          });

          child.once("error", (error) => {
            clearTimeout(timeout);
            reject(error);
          });
          child.once("exit", (code, signal) => {
            this.#children.delete(role);
            this.#identities.delete(role);
            this.#events.emit("runtime-exit", { role, code, signal });
          });
        }),
    );

    try {
      const identities = await Promise.all(ready);
      if (new Set(identities.map(({ pid }) => pid)).size !== identities.length) {
        throw new Error("runtime process identifiers are not isolated");
      }
      return identities;
    } catch (error) {
      await this.shutdown();
      throw error;
    }
  }

  onDemoEvent(listener: (event: DemoEvent) => void): () => void {
    this.#events.on("demo-event", listener);
    return () => this.#events.off("demo-event", listener);
  }

  joinRoom(
    role: PartyRole,
    input: { sessionId: string; productCode: string },
  ): void {
    this.#send({
      protocolVersion: PROTOCOL_VERSION,
      type: "JOIN_ROOM",
      requestId: createRequestId(),
      target: role,
      ...input,
    });
  }

  setLimit(role: PartyRole, input: { sessionId: string; limitKrw: string }): void {
    this.#send({
      protocolVersion: PROTOCOL_VERSION,
      type: "SET_LIMIT",
      requestId: createRequestId(),
      target: role,
      ...input,
    });
  }

  configureObserver(input: { sessionId: string; productCode: string }): void {
    this.#send({
      protocolVersion: PROTOCOL_VERSION,
      type: "CONFIGURE_OBSERVER",
      requestId: createRequestId(),
      target: "observer",
      ...input,
    });
  }

  startNegotiation(): void {
    for (const target of ["buyer", "seller", "observer"] as const) {
      this.#send({
        protocolVersion: PROTOCOL_VERSION,
        type: "START_RUNTIME",
        requestId: createRequestId(),
        target,
      });
    }
  }

  async shutdown(timeoutMs = 2_000): Promise<void> {
    const children = [...this.#children.entries()];
    if (children.length === 0) {
      this.#started = false;
      return;
    }

    const exits = children.map(
      ([role, child]) =>
        new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (child.exitCode === null) child.kill();
            resolve();
          }, timeoutMs);
          child.once("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
          if (child.connected) {
            this.#send({
              protocolVersion: PROTOCOL_VERSION,
              type: "SHUTDOWN_RUNTIME",
              requestId: createRequestId(),
              target: role,
            });
          } else {
            clearTimeout(timeout);
            if (child.exitCode === null) child.kill();
            resolve();
          }
        }),
    );

    await Promise.all(exits);
    this.#children.clear();
    this.#identities.clear();
    this.#partyRooms.clear();
    this.#lockedSessions.clear();
    this.#peerReadySessions.clear();
    this.#started = false;
  }

  #acceptPartyEvent(role: PartyRole, event: DemoEvent): void {
    if (event.state === "ROOM_JOINED" && event.productCode !== undefined) {
      this.#partyRooms.set(role, {
        sessionId: event.sessionId,
        productCode: event.productCode,
      });
      this.#lockedSessions.delete(role);
      return;
    }
    if (event.state !== "LIMIT_LOCKED") return;

    this.#lockedSessions.set(role, event.sessionId);
    const buyerRoom = this.#partyRooms.get("buyer");
    const sellerRoom = this.#partyRooms.get("seller");
    if (
      buyerRoom === undefined ||
      sellerRoom === undefined ||
      buyerRoom.sessionId !== event.sessionId ||
      sellerRoom.sessionId !== event.sessionId ||
      buyerRoom.productCode !== sellerRoom.productCode ||
      this.#lockedSessions.get("buyer") !== event.sessionId ||
      this.#lockedSessions.get("seller") !== event.sessionId ||
      this.#peerReadySessions.has(event.sessionId)
    ) {
      return;
    }

    this.#peerReadySessions.add(event.sessionId);
    for (const target of ["buyer", "seller"] as const) {
      this.#send({
        protocolVersion: PROTOCOL_VERSION,
        type: "PEER_READY",
        requestId: createRequestId(),
        target,
        sessionId: event.sessionId,
      });
    }
  }

  #send(raw: RuntimeCommand): void {
    const command = parseRuntimeCommand(raw);
    const child = this.#children.get(command.target);
    if (child === undefined || !child.connected) {
      throw new Error(`${command.target} runtime is not connected`);
    }
    child.send(command);
  }
}
