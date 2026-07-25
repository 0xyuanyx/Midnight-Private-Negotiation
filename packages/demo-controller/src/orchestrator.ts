import { fork, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import {
  PROTOCOL_VERSION,
  createDemoEvent,
  createRequestId,
  parseRuntimeCommand,
  parseRuntimeMessage,
  type DemoEvent,
  type DemoState,
  type PartyRole,
  type Role,
  type RuntimeCommand,
} from "@midnight-negotiation/protocol";

export type RuntimeIdentity = {
  role: Role;
  pid: number;
};

type RuntimeEntryMap = Record<Role, string>;
type PartyRoom = { sessionId: string; productCode: string };
export type RelayIdentity = {
  pid: number;
  host: string;
  port: number;
};

const defaultRuntimeEntries = (): RuntimeEntryMap => ({
  buyer: fileURLToPath(
    new URL("../../buyer-runtime/dist/index.js", import.meta.url),
  ),
  seller: fileURLToPath(
    new URL("../../seller-runtime/dist/index.js", import.meta.url),
  ),
  observer: fileURLToPath(
    new URL("../../observer-runtime/dist/index.js", import.meta.url),
  ),
});

const defaultRelayEntry = (): string =>
  fileURLToPath(new URL("../../room-relay/dist/server.js", import.meta.url));

const defaultFunderEntry = (): string =>
  fileURLToPath(new URL("../../midnight-adapter/dist/funder.js", import.meta.url));

const chainMode = process.env.MIDNIGHT_MODE === "local";

const midnightConfig = (role: Role): Record<string, string> => {
  const common = {
    indexer:
      process.env.MIDNIGHT_INDEXER ??
      "http://127.0.0.1:8088/api/v3/graphql",
    indexerWS:
      process.env.MIDNIGHT_INDEXER_WS ??
      "ws://127.0.0.1:8088/api/v3/graphql/ws",
  };
  if (role === "observer") return common;
  return {
    ...common,
    node: process.env.MIDNIGHT_NODE ?? "http://127.0.0.1:9944",
    proofServer:
      role === "buyer"
        ? process.env.MIDNIGHT_BUYER_PROOF ?? "http://127.0.0.1:6301"
        : process.env.MIDNIGHT_SELLER_PROOF ?? "http://127.0.0.1:6302",
  };
};

const waitForEndpoint = async (
  url: string,
  timeoutMs = 180_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch {
      // The local service can refuse connections while loading proving assets.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Midnight local service did not become ready: ${url}`);
};

const publicProcessEnvironment = (
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL"]) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return { ...environment, ...overrides };
};

export class IsolatedRuntimeController {
  readonly #children = new Map<Role, ChildProcess>();
  readonly #identities = new Map<Role, RuntimeIdentity>();
  readonly #partyRooms = new Map<PartyRole, PartyRoom>();
  readonly #relayChannelSessions = new Map<PartyRole, string>();
  readonly #commitmentSessions = new Map<PartyRole, string>();
  readonly #peerCommitmentNotices = new Set<string>();
  readonly #peerReadySessions = new Set<string>();
  readonly #observerSessions = new Set<string>();
  readonly #chainOpenSessions = new Set<string>();
  readonly #chainAuthorizedSessions = new Set<string>();
  readonly #chainWalletAddresses = new Map<PartyRole, string>();
  readonly #pendingSettlements = new Map<string, string>();
  readonly #negotiationAnnouncedSessions = new Set<string>();
  readonly #negotiationDisplayReadySessions = new Set<string>();
  readonly #negotiatingSessions = new Set<string>();
  readonly #finishedSessions = new Set<string>();
  readonly #events = new EventEmitter();
  readonly #entries: RuntimeEntryMap;
  readonly #relayEntry: string;
  readonly #funderEntry: string;
  readonly #timers = new Set<NodeJS.Timeout>();
  #relayChild: ChildProcess | undefined;
  #funderChild: ChildProcess | undefined;
  #fundingStarted = false;
  #relayIdentity: RelayIdentity | undefined;
  #relayTokens: Record<PartyRole, string> | undefined;
  #started = false;

  constructor(
    entries: RuntimeEntryMap = defaultRuntimeEntries(),
    relayEntry = defaultRelayEntry(),
    funderEntry = defaultFunderEntry(),
  ) {
    this.#entries = entries;
    this.#relayEntry = relayEntry;
    this.#funderEntry = funderEntry;
  }

  async start(timeoutMs = 5_000): Promise<RuntimeIdentity[]> {
    if (this.#started) throw new Error("runtime controller is already started");
    this.#started = true;
    try {
      if (chainMode) {
        await Promise.all([
          waitForEndpoint(`${midnightConfig("buyer").proofServer}/version`),
          waitForEndpoint(`${midnightConfig("seller").proofServer}/version`),
        ]);
      }
      await this.#startRelay(timeoutMs);
    } catch (error) {
      await this.shutdown();
      throw error;
    }
    const relayIdentity = this.#relayIdentity;
    const relayTokens = this.#relayTokens;
    if (relayIdentity === undefined || relayTokens === undefined) {
      throw new Error("Room Relay did not become ready");
    }

    const ready = (["buyer", "seller", "observer"] as const).map(
      (role) =>
        new Promise<RuntimeIdentity>((resolve, reject) => {
          const child = fork(this.#entries[role], [], {
            env: publicProcessEnvironment({
              ...(chainMode
                ? {
                    MIDNIGHT_MODE: "local",
                    MIDNIGHT_CONFIG: JSON.stringify(midnightConfig(role)),
                  }
                : {}),
              ...(role === "observer"
                ? {}
                : {
                    ROOM_RELAY_HOST: relayIdentity.host,
                    ROOM_RELAY_PORT: String(relayIdentity.port),
                    ROOM_RELAY_TOKEN: relayTokens[role],
                  }),
            }),
            stdio: ["ignore", "ignore", "inherit", "ipc"],
          });
          this.#children.set(role, child);

          const timeout = setTimeout(() => {
            reject(new Error(`${role} runtime readiness timed out`));
          }, timeoutMs);

          child.on("message", (raw: unknown) => {
            try {
              const message = parseRuntimeMessage(raw);
              switch (message.type) {
                case "RUNTIME_READY": {
                  if (
                    message.role !== role ||
                    message.pid !== child.pid ||
                    this.#identities.has(role)
                  ) {
                    throw new Error(
                      "runtime identity does not match its child process",
                    );
                  }
                  const identity = { role, pid: message.pid };
                  this.#identities.set(role, identity);
                  clearTimeout(timeout);
                  resolve(identity);
                  return;
                }
                case "DEMO_EVENT":
                  if (message.event.panel !== role) {
                    throw new Error(
                      "demo event panel does not match its child process",
                    );
                  }
                  if (role === "observer") {
                    this.#emit(message.event);
                    this.#acceptObserverEvent(message.event);
                  } else {
                    if (this.#shouldDisplayPartyEvent(role, message.event)) {
                      this.#emit(message.event);
                    }
                    this.#acceptPartyEvent(role, message.event);
                  }
                  return;
                case "RUNTIME_BOOT_FAILED":
                  if (message.role !== role) {
                    throw new Error("runtime boot failure role mismatch");
                  }
                  this.#events.emit(
                    "controller-error",
                    new Error(`${role} chain bootstrap failed: ${message.reason}`),
                  );
                  return;
                case "CHAIN_WALLET_READY":
                  if (
                    role === "observer" ||
                    message.role !== role ||
                    this.#chainWalletAddresses.has(role)
                  ) {
                    throw new Error("chain wallet identity does not match runtime");
                  }
                  this.#chainWalletAddresses.set(role, message.walletAddress);
                  this.#tryStartFunder();
                  return;
                case "CHAIN_TX_CONFIRMED":
                  if (
                    role === "observer" ||
                    message.role !== role
                  ) {
                    throw new Error("chain transaction role mismatch");
                  }
                  this.#acceptChainTransaction(message);
                  return;
                case "RELAY_CHANNEL_READY":
                  if (role === "observer" || message.role !== role) {
                    throw new Error(
                      "relay readiness does not match its party process",
                    );
                  }
                  this.#relayChannelSessions.set(role, message.sessionId);
                  this.#tryStartNegotiation(message.sessionId);
                  return;
                case "NEGOTIATION_OUTCOME":
                  if (role !== "buyer" || message.role !== "buyer") {
                    throw new Error(
                      "negotiation outcome must come from Buyer",
                    );
                  }
                  this.#acceptOutcome(message);
                  return;
              }
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

  onControllerError(listener: (error: unknown) => void): () => void {
    this.#events.on("controller-error", listener);
    return () => this.#events.off("controller-error", listener);
  }

  getRelayIdentity(): RelayIdentity {
    if (this.#relayIdentity === undefined) {
      throw new Error("Room Relay is not running");
    }
    return { ...this.#relayIdentity };
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

  setLimit(
    role: PartyRole,
    input: { sessionId: string; limitKrw: string },
  ): void {
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
    this.#observerSessions.add(input.sessionId);
  }

  startNegotiation(sessionId?: string): void {
    const sessions =
      sessionId === undefined ? [...this.#peerReadySessions] : [sessionId];
    for (const candidate of sessions) this.#tryStartNegotiation(candidate);
  }

  async shutdown(timeoutMs = 2_000): Promise<void> {
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();

    const children = [...this.#children.entries()];
    if (children.length === 0) {
      await this.#shutdownFunder(timeoutMs);
      await this.#shutdownRelay(timeoutMs);
      this.#resetState();
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
    await this.#shutdownFunder(timeoutMs);
    await this.#shutdownRelay(timeoutMs);
    this.#children.clear();
    this.#identities.clear();
    this.#resetState();
  }

  #resetState(): void {
    this.#partyRooms.clear();
    this.#relayChannelSessions.clear();
    this.#commitmentSessions.clear();
    this.#peerCommitmentNotices.clear();
    this.#peerReadySessions.clear();
    this.#observerSessions.clear();
    this.#chainOpenSessions.clear();
    this.#chainAuthorizedSessions.clear();
    this.#chainWalletAddresses.clear();
    this.#pendingSettlements.clear();
    this.#negotiationAnnouncedSessions.clear();
    this.#negotiationDisplayReadySessions.clear();
    this.#negotiatingSessions.clear();
    this.#finishedSessions.clear();
    this.#relayIdentity = undefined;
    this.#relayTokens = undefined;
    this.#fundingStarted = false;
    this.#started = false;
  }

  #emit(event: DemoEvent): void {
    this.#events.emit("demo-event", event);
  }

  #emitParticipantPair(input: {
    sessionId: string;
    state: DemoState;
    buyerMessageCode: string;
    sellerMessageCode: string;
    occurredAt?: string;
    correlationId?: string;
    replaceKeys?: Record<PartyRole, string>;
    agreedAmount?: string;
  }): void {
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const correlationId = input.correlationId ?? createRequestId();
    for (const panel of ["buyer", "seller"] as const) {
      this.#emit(
        createDemoEvent({
          panel,
          sessionId: input.sessionId,
          state: input.state,
          messageCode:
            panel === "buyer"
              ? input.buyerMessageCode
              : input.sellerMessageCode,
          audience: "PARTICIPANTS",
          occurredAt,
          correlationId,
          ...(input.replaceKeys === undefined
            ? {}
            : { replaceKey: input.replaceKeys[panel] }),
          ...(input.agreedAmount === undefined
            ? {}
            : { agreedAmount: input.agreedAmount }),
        }),
      );
    }
  }

  #acceptPartyEvent(role: PartyRole, event: DemoEvent): void {
    if (event.state === "ROOM_JOINED" && event.productCode !== undefined) {
      this.#partyRooms.set(role, {
        sessionId: event.sessionId,
        productCode: event.productCode,
      });
      this.#commitmentSessions.delete(role);
      const peer = role === "buyer" ? "seller" : "buyer";
      const peerRoom = this.#partyRooms.get(peer);
      const peerAlreadyJoined =
        peerRoom?.sessionId === event.sessionId &&
        peerRoom.productCode === event.productCode;
      if (!peerAlreadyJoined) {
        this.#emit(
          createDemoEvent({
            panel: role,
            sessionId: event.sessionId,
            state: "WAITING_PEER",
            messageCode:
              role === "buyer" ? "WAITING_SELLER" : "WAITING_BUYER",
            audience: "ROLE_LOCAL",
            replaceKey: `${role}-peer-entry`,
          }),
        );
      }
      this.#tryMatchRoom(event.sessionId);
      return;
    }

    if (
      event.state === "WAITING_PEER" &&
      (event.messageCode === "WAITING_SELLER_COMMITMENT" ||
        event.messageCode === "WAITING_BUYER_COMMITMENT")
    ) {
      this.#commitmentSessions.set(role, event.sessionId);
      this.#tryReadySession(event.sessionId);
    }
  }

  #shouldDisplayPartyEvent(role: PartyRole, event: DemoEvent): boolean {
    const waitingForKnownPeerCommitment =
      event.state === "WAITING_PEER" &&
      ((role === "buyer" &&
        event.messageCode === "WAITING_SELLER_COMMITMENT") ||
        (role === "seller" &&
          event.messageCode === "WAITING_BUYER_COMMITMENT")) &&
      this.#peerCommitmentNotices.has(`${role}:${event.sessionId}`);
    return !waitingForKnownPeerCommitment;
  }

  #acceptChainTransaction(message: {
    role: PartyRole;
    sessionId: string;
    contractAddress: string;
    state: "WAITING_SELLER" | "OPEN" | "AUTHORIZED" | "SETTLED" | "CANCELLED";
  }): void {
    const validRole =
      (message.role === "buyer" &&
        ["WAITING_SELLER", "AUTHORIZED", "CANCELLED"].includes(message.state)) ||
      (message.role === "seller" &&
        ["OPEN", "SETTLED"].includes(message.state));
    if (!chainMode || !validRole) {
      throw new Error("unexpected chain transaction state");
    }
    if (message.state === "WAITING_SELLER") return;
    this.#send({
      protocolVersion: PROTOCOL_VERSION,
      type: "OBSERVE_CHAIN_STATE",
      requestId: createRequestId(),
      target: "observer",
      sessionId: message.sessionId,
      contractAddress: message.contractAddress,
      expectedState: message.state,
    });
  }

  #acceptObserverEvent(event: DemoEvent): void {
    if (!chainMode || event.audience !== "PUBLIC") return;
    if (event.state === "OPEN") {
      this.#chainOpenSessions.add(event.sessionId);
      this.#tryStartNegotiation(event.sessionId);
      return;
    }
    if (event.state === "AUTHORIZED") {
      this.#chainAuthorizedSessions.add(event.sessionId);
      this.#emitProofsComplete(event.sessionId, event.occurredAt);
      this.#emitSettlementFinalizing(event.sessionId, event.occurredAt);
      return;
    }
    if (event.state === "CANCELLED") {
      this.#emitParticipantPair({
        sessionId: event.sessionId,
        state: "CANCELLED",
        buyerMessageCode: "NEGOTIATION_CANCELLED",
        sellerMessageCode: "NEGOTIATION_CANCELLED",
        occurredAt: event.occurredAt,
        replaceKeys: {
          buyer: "buyer-cancellation",
          seller: "seller-cancellation",
        },
      });
      return;
    }
    if (event.state === "SETTLED") {
      const agreedAmount = this.#pendingSettlements.get(event.sessionId);
      if (agreedAmount === undefined || event.publicAmount !== agreedAmount) {
        throw new Error("indexed settlement does not match negotiated amount");
      }
      if (!this.#chainAuthorizedSessions.has(event.sessionId)) {
        this.#chainAuthorizedSessions.add(event.sessionId);
        this.#emitProofsComplete(event.sessionId, event.occurredAt);
        this.#emitSettlementFinalizing(event.sessionId, event.occurredAt);
      }
      this.#emitParticipantPair({
        sessionId: event.sessionId,
        state: "AGREED",
        buyerMessageCode: "NEGOTIATION_SETTLED",
        sellerMessageCode: "NEGOTIATION_SETTLED",
        occurredAt: event.occurredAt,
        agreedAmount,
        replaceKeys: {
          buyer: "buyer-settlement",
          seller: "seller-settlement",
        },
      });
      this.#emitParticipantPair({
        sessionId: event.sessionId,
        state: "SETTLED",
        buyerMessageCode: "ONCHAIN_RECORDED",
        sellerMessageCode: "ONCHAIN_RECORDED",
        occurredAt: event.occurredAt,
      });
      this.#pendingSettlements.delete(event.sessionId);
    }
  }

  #emitProofsComplete(sessionId: string, occurredAt: string): void {
    this.#emitParticipantPair({
      sessionId,
      state: "PROOFS_COMPLETE",
      buyerMessageCode: "PROOFS_COMPLETE",
      sellerMessageCode: "PROOFS_COMPLETE",
      occurredAt,
      replaceKeys: {
        buyer: "buyer-proof",
        seller: "seller-proof",
      },
    });
  }

  #emitSettlementFinalizing(sessionId: string, occurredAt: string): void {
    this.#emitParticipantPair({
      sessionId,
      state: "FINALIZING",
      buyerMessageCode: "FINALIZING_SETTLEMENT",
      sellerMessageCode: "FINALIZING_SETTLEMENT",
      occurredAt,
      replaceKeys: {
        buyer: "buyer-settlement",
        seller: "seller-settlement",
      },
    });
  }

  #tryMatchRoom(sessionId: string): void {
    const buyerRoom = this.#partyRooms.get("buyer");
    const sellerRoom = this.#partyRooms.get("seller");
    if (
      buyerRoom === undefined ||
      sellerRoom === undefined ||
      buyerRoom.sessionId !== sessionId ||
      sellerRoom.sessionId !== sessionId ||
      buyerRoom.productCode !== sellerRoom.productCode
    ) {
      return;
    }

    this.#emitParticipantPair({
      sessionId,
      state: "PEER_JOINED",
      buyerMessageCode: "SELLER_JOINED",
      sellerMessageCode: "BUYER_JOINED",
      replaceKeys: {
        buyer: "buyer-peer-entry",
        seller: "seller-peer-entry",
      },
    });
    this.#emitPeerCommitmentNotice("buyer", sessionId);
    this.#emitPeerCommitmentNotice("seller", sessionId);

    if (!this.#observerSessions.has(sessionId)) {
      this.configureObserver({
        sessionId,
        productCode: buyerRoom.productCode,
      });
    }
  }

  #tryReadySession(sessionId: string): void {
    if (
      this.#commitmentSessions.get("buyer") !== sessionId ||
      this.#commitmentSessions.get("seller") !== sessionId ||
      this.#peerReadySessions.has(sessionId)
    ) {
      return;
    }

    this.#peerReadySessions.add(sessionId);
    for (const target of ["buyer", "seller"] as const) {
      this.#send({
        protocolVersion: PROTOCOL_VERSION,
        type: "PEER_READY",
        requestId: createRequestId(),
        target,
        sessionId,
      });
    }

    const occurredAt = new Date().toISOString();
    const correlationId = createRequestId();
    this.#emitPeerCommitmentNotice(
      "buyer",
      sessionId,
      occurredAt,
      correlationId,
    );
    this.#emitPeerCommitmentNotice(
      "seller",
      sessionId,
      occurredAt,
      correlationId,
    );
    this.#announceNegotiation(sessionId);
    if (!chainMode) {
      this.#publishPublicState(
        sessionId,
        "OPEN",
        "OBSERVER_OPEN",
        new Date().toISOString(),
      );
    }
  }

  #emitPeerCommitmentNotice(
    role: PartyRole,
    sessionId: string,
    occurredAt = new Date().toISOString(),
    correlationId = createRequestId(),
  ): void {
    const peer = role === "buyer" ? "seller" : "buyer";
    const noticeKey = `${role}:${sessionId}`;
    if (
      this.#commitmentSessions.get(peer) !== sessionId ||
      this.#peerCommitmentNotices.has(noticeKey)
    ) {
      return;
    }
    this.#peerCommitmentNotices.add(noticeKey);
    this.#emit(
      createDemoEvent({
        panel: role,
        sessionId,
        state: "PEER_COMMITMENT_REGISTERED",
        messageCode:
          role === "buyer"
            ? "SELLER_COMMITMENT_REGISTERED"
            : "BUYER_COMMITMENT_REGISTERED",
        audience: "PARTICIPANTS",
        occurredAt,
        correlationId,
        replaceKey: `${role}-peer-commitment`,
      }),
    );
  }

  #announceNegotiation(sessionId: string): void {
    if (
      this.#negotiationAnnouncedSessions.has(sessionId) ||
      this.#finishedSessions.has(sessionId)
    ) {
      return;
    }
    this.#negotiationAnnouncedSessions.add(sessionId);
    this.#emitParticipantPair({
      sessionId,
      state: "NEGOTIATING",
      buyerMessageCode: "NEGOTIATION_START",
      sellerMessageCode: "NEGOTIATION_START",
      replaceKeys: {
        buyer: "buyer-negotiation",
        seller: "seller-negotiation",
      },
    });
    this.#schedule(800, () => {
      if (this.#finishedSessions.has(sessionId)) return;
      this.#emitParticipantPair({
        sessionId,
        state: "NEGOTIATING",
        buyerMessageCode: "NEGOTIATING",
        sellerMessageCode: "NEGOTIATING",
        replaceKeys: {
          buyer: "buyer-negotiation",
          seller: "seller-negotiation",
        },
      });
      this.#negotiationDisplayReadySessions.add(sessionId);
      this.#tryStartNegotiation(sessionId);
    });
  }

  #tryStartNegotiation(sessionId: string): void {
    if (
      !this.#peerReadySessions.has(sessionId) ||
      !this.#negotiationDisplayReadySessions.has(sessionId) ||
      (chainMode && !this.#chainOpenSessions.has(sessionId)) ||
      this.#relayChannelSessions.get("buyer") !== sessionId ||
      this.#relayChannelSessions.get("seller") !== sessionId ||
      this.#negotiatingSessions.has(sessionId) ||
      this.#finishedSessions.has(sessionId)
    ) {
      return;
    }

    this.#negotiatingSessions.add(sessionId);
    for (const target of ["buyer", "seller"] as const) {
      this.#send({
        protocolVersion: PROTOCOL_VERSION,
        type: "START_RUNTIME",
        requestId: createRequestId(),
        target,
      });
    }
  }

  #acceptOutcome(
    message:
      | {
          sessionId: string;
          result: "SETTLED";
          agreedAmount: string;
        }
      | { sessionId: string; result: "CANCELLED" },
  ): void {
    if (
      !this.#negotiatingSessions.has(message.sessionId) ||
      this.#finishedSessions.has(message.sessionId)
    ) {
      return;
    }
    this.#finishedSessions.add(message.sessionId);

    this.#emitParticipantPair({
      sessionId: message.sessionId,
      state: "NEGOTIATION_COMPLETE",
      buyerMessageCode: "NEGOTIATION_COMPLETE",
      sellerMessageCode: "NEGOTIATION_COMPLETE",
      replaceKeys: {
        buyer: "buyer-negotiation",
        seller: "seller-negotiation",
      },
    });

    if (message.result === "CANCELLED") {
      if (chainMode) {
        this.#emitParticipantPair({
          sessionId: message.sessionId,
          state: "FINALIZING",
          buyerMessageCode: "FINALIZING_CANCELLATION",
          sellerMessageCode: "FINALIZING_CANCELLATION",
          replaceKeys: {
            buyer: "buyer-cancellation",
            seller: "seller-cancellation",
          },
        });
        return;
      }
      this.#schedule(140, () => {
        const occurredAt = new Date().toISOString();
        this.#emitParticipantPair({
          sessionId: message.sessionId,
          state: "CANCELLED",
          buyerMessageCode: "NEGOTIATION_CANCELLED",
          sellerMessageCode: "NEGOTIATION_CANCELLED",
          occurredAt,
        });
        this.#publishPublicState(
          message.sessionId,
          "CANCELLED",
          "OBSERVER_CANCELLED",
          occurredAt,
        );
      });
      return;
    }

    if (chainMode) {
      this.#pendingSettlements.set(message.sessionId, message.agreedAmount);
      this.#emitParticipantPair({
        sessionId: message.sessionId,
        state: "VERIFYING",
        buyerMessageCode: "VERIFYING",
        sellerMessageCode: "VERIFYING",
        replaceKeys: {
          buyer: "buyer-proof",
          seller: "seller-proof",
        },
      });
      return;
    }

    this.#schedule(140, () => {
      this.#emitParticipantPair({
        sessionId: message.sessionId,
        state: "VERIFYING",
        buyerMessageCode: "VERIFYING",
        sellerMessageCode: "VERIFYING",
        replaceKeys: {
          buyer: "buyer-proof",
          seller: "seller-proof",
        },
      });
    });
    this.#schedule(1_340, () => {
      const occurredAt = new Date().toISOString();
      this.#emitParticipantPair({
        sessionId: message.sessionId,
        state: "PROOFS_COMPLETE",
        buyerMessageCode: "PROOFS_COMPLETE",
        sellerMessageCode: "PROOFS_COMPLETE",
        occurredAt,
        replaceKeys: {
          buyer: "buyer-proof",
          seller: "seller-proof",
        },
      });
      this.#publishPublicState(
        message.sessionId,
        "AUTHORIZED",
        "OBSERVER_AUTHORIZED",
        occurredAt,
      );
    });
    this.#schedule(1_500, () => {
      this.#emitParticipantPair({
        sessionId: message.sessionId,
        state: "AGREED",
        buyerMessageCode: "NEGOTIATION_SETTLED",
        sellerMessageCode: "NEGOTIATION_SETTLED",
        agreedAmount: message.agreedAmount,
      });
    });
    this.#schedule(2_300, () => {
      const occurredAt = new Date().toISOString();
      this.#emitParticipantPair({
        sessionId: message.sessionId,
        state: "SETTLED",
        buyerMessageCode: "ONCHAIN_RECORDED",
        sellerMessageCode: "ONCHAIN_RECORDED",
        occurredAt,
      });
      this.#publishPublicState(
        message.sessionId,
        "SETTLED",
        "OBSERVER_SETTLED",
        occurredAt,
        message.agreedAmount,
      );
    });
  }

  #publishPublicState(
    sessionId: string,
    state: "OPEN" | "AUTHORIZED" | "SETTLED" | "CANCELLED",
    messageCode: string,
    occurredAt: string,
    publicAmount?: string,
  ): void {
    if (!this.#observerSessions.has(sessionId)) return;
    this.#send({
      protocolVersion: PROTOCOL_VERSION,
      type: "PUBLISH_PUBLIC_STATE",
      requestId: createRequestId(),
      target: "observer",
      sessionId,
      state,
      messageCode,
      occurredAt,
      ...(publicAmount === undefined ? {} : { publicAmount }),
    });
  }

  #tryStartFunder(): void {
    if (!chainMode || this.#fundingStarted) return;
    const buyerAddress = this.#chainWalletAddresses.get("buyer");
    const sellerAddress = this.#chainWalletAddresses.get("seller");
    if (buyerAddress === undefined || sellerAddress === undefined) return;
    this.#fundingStarted = true;
    const child = fork(this.#funderEntry, [], {
      env: publicProcessEnvironment({
        MIDNIGHT_FUNDER_INPUT: JSON.stringify({
          config: midnightConfig("buyer"),
          recipients: [buyerAddress, sellerAddress],
          amount: "10000000000000",
        }),
      }),
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    this.#funderChild = child;
    child.once("message", (raw: unknown) => {
      if (
        typeof raw !== "object" ||
        raw === null ||
        (raw as { type?: unknown }).type !== "FUNDING_COMPLETE"
      ) {
        this.#events.emit(
          "controller-error",
          new Error("Midnight funder returned an invalid response"),
        );
        return;
      }
      for (const target of ["buyer", "seller"] as const) {
        this.#send({
          protocolVersion: PROTOCOL_VERSION,
          type: "CHAIN_FUNDED",
          requestId: createRequestId(),
          target,
        });
      }
    });
    child.once("error", (error) => {
      this.#events.emit("controller-error", error);
    });
    child.once("exit", (code, signal) => {
      this.#funderChild = undefined;
      if (code !== 0) {
        this.#events.emit(
          "controller-error",
          new Error(`Midnight funder exited (${String(code ?? signal)})`),
        );
      }
    });
  }

  async #shutdownFunder(timeoutMs: number): Promise<void> {
    const child = this.#funderChild;
    if (child === undefined) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (child.exitCode === null) child.kill();
        resolve();
      }, timeoutMs);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      if (child.exitCode !== null) {
        clearTimeout(timeout);
        resolve();
      } else {
        child.kill("SIGTERM");
      }
    });
    this.#funderChild = undefined;
  }

  async #startRelay(timeoutMs: number): Promise<void> {
    const relayTokens: Record<PartyRole, string> = {
      buyer: randomBytes(32).toString("hex"),
      seller: randomBytes(32).toString("hex"),
    };
    this.#relayTokens = relayTokens;
    const child = fork(this.#relayEntry, [], {
      env: publicProcessEnvironment({
        ROOM_RELAY_PORT: "0",
        BUYER_RELAY_TOKEN: relayTokens.buyer,
        SELLER_RELAY_TOKEN: relayTokens.seller,
      }),
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    this.#relayChild = child;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Room Relay readiness timed out"));
      }, timeoutMs);
      child.once("message", (raw: unknown) => {
        if (
          typeof raw !== "object" ||
          raw === null ||
          (raw as { relayProtocolVersion?: unknown }).relayProtocolVersion !==
            1 ||
          (raw as { type?: unknown }).type !== "RELAY_READY" ||
          typeof (raw as { pid?: unknown }).pid !== "number" ||
          (raw as { pid?: unknown }).pid !== child.pid ||
          (raw as { host?: unknown }).host !== "127.0.0.1" ||
          typeof (raw as { port?: unknown }).port !== "number" ||
          !Number.isInteger((raw as { port: number }).port) ||
          (raw as { port: number }).port < 1 ||
          (raw as { port: number }).port > 65_535
        ) {
          clearTimeout(timeout);
          reject(new Error("Room Relay returned an invalid identity"));
          return;
        }
        this.#relayIdentity = {
          pid: (raw as { pid: number }).pid,
          host: "127.0.0.1",
          port: (raw as { port: number }).port,
        };
        clearTimeout(timeout);
        resolve();
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code, signal) => {
        this.#relayChild = undefined;
        this.#events.emit("relay-exit", { code, signal });
      });
    });
  }

  async #shutdownRelay(timeoutMs: number): Promise<void> {
    const child = this.#relayChild;
    if (child === undefined) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (child.exitCode === null) child.kill();
        resolve();
      }, timeoutMs);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      if (child.connected) {
        child.send({ type: "SHUTDOWN_RELAY" });
      } else {
        clearTimeout(timeout);
        if (child.exitCode === null) child.kill();
        resolve();
      }
    });
    this.#relayChild = undefined;
  }

  #schedule(delayMs: number, callback: () => void): void {
    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      callback();
    }, delayMs);
    this.#timers.add(timer);
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
