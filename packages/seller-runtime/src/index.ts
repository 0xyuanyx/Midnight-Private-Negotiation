import {
  createHash,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from "node:crypto";
import {
  PROTOCOL_VERSION,
  createDemoEvent,
  parseRuntimeCommand,
  type EventAudience,
  type RuntimeMessage,
} from "@midnight-negotiation/protocol";
import {
  RoomRelayClient,
  decryptRelayPayload,
  encryptRelayPayload,
  type RelayPacket,
  type RelayPeerKey,
} from "@midnight-negotiation/room-relay";
import {
  createCandidateProviderFromEnvironment,
  generateAllowedCandidate,
  generateLocalFallbackCandidate,
  type NegotiationCandidate,
  type PublicNegotiationContext,
} from "@midnight-negotiation/agent-core";
import type { SessionRecord } from "@midnight-negotiation/evidence";
import type {
  DeployedNegotiationContract,
  MidnightLocalConfig,
  NegotiationProviders,
  RoleStorage,
  WalletContext,
} from "@midnight-negotiation/midnight-adapter";
import type { SellerPrivateState } from "@midnight-negotiation/negotiation-contract";

const role = "seller" as const;
const MAX_ROUNDS = 10;
const publicReferencePrice =
  process.env.NEGOTIATION_REFERENCE_PRICE_KRW ?? "100000";
const candidateProvider = createCandidateProviderFromEnvironment();
const chainMode = process.env.MIDNIGHT_MODE === "local";

let sessionId: string | undefined;
let productCode: string | undefined;
let sellerMinPrice: bigint | undefined;
let privateKey: KeyObject | undefined;
let sharedKey: Buffer | undefined;
let relayClient: RoomRelayClient | undefined;
let sentSequence = 0;
let receivedSequence = 0;
let chainFundedResolve: (() => void) | undefined;
let chainWalletPromise: Promise<WalletContext> | undefined;
let chainProviders: NegotiationProviders | undefined;
let chainContract: DeployedNegotiationContract | undefined;
let chainContractAddress: string | undefined;
let pendingContractAddress: string | undefined;
let sellerChainState: SellerPrivateState | undefined;
let chainJoinStarted = false;
let sellerKeySent = false;
let agreedPrice: string | undefined;
let roleStorage: RoleStorage | undefined;
let sessionRecord: SessionRecord | undefined;
let peerReady = false;
let lastSentOffer:
  | {
      round: number;
      price: string;
    }
  | undefined;

const send = (message: RuntimeMessage): void => {
  if (process.send === undefined) {
    throw new Error("seller runtime requires an IPC parent");
  }
  process.send(message);
};

const chainFunded = new Promise<void>((resolve) => {
  chainFundedResolve = resolve;
});

const readChainConfig = (): MidnightLocalConfig => {
  const value = JSON.parse(process.env.MIDNIGHT_CONFIG ?? "") as Partial<MidnightLocalConfig>;
  for (const key of ["indexer", "indexerWS", "node", "proofServer"] as const) {
    if (typeof value[key] !== "string") {
      throw new Error(`seller Midnight configuration is missing ${key}`);
    }
  }
  return value as MidnightLocalConfig;
};

const initializeChainWallet = async (): Promise<WalletContext> => {
  const adapter = await import("@midnight-negotiation/midnight-adapter");
  adapter.useUndeployedNetwork();
  // Key store first: without it no private state or evidence can be protected.
  roleStorage = await adapter.prepareRoleStorage(role);
  // Finish sessions an earlier run left open before this run touches storage.
  await adapter
    .recoverRoleSessions(roleStorage, readChainConfig())
    .then((results) => {
      if (results.length > 0) {
        console.error(
          `[seller] recovered sessions: ${results
            .map(({ outcome }) => ("reason" in outcome ? `${outcome.kind}:${outcome.reason}` : outcome.kind))
            .join(", ")}`,
        );
      }
    })
    .catch(() => console.error("[seller] session recovery failed; records kept"));
  const seed = randomBytes(32).toString("hex");
  send({
    protocolVersion: PROTOCOL_VERSION,
    type: "CHAIN_WALLET_READY",
    role,
    walletAddress: adapter.getUnshieldedAddressForSeed(seed),
  });
  const wallet = await adapter.buildWallet(readChainConfig(), seed);
  await chainFunded;
  await adapter.prepareWalletForTransactions(wallet);
  return wallet;
};

const emit = (
  state: Parameters<typeof createDemoEvent>[0]["state"],
  messageCode: string,
  audience: EventAudience,
  options: { replaceKey?: string } = {},
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
      ...options,
      ...(state === "ROOM_JOINED" && productCode !== undefined
        ? { productCode }
        : {}),
    }),
  });
};

const deriveSharedKey = (peerPublicKey: string): Buffer => {
  if (
    privateKey === undefined ||
    sessionId === undefined ||
    productCode === undefined
  ) {
    throw new Error("seller relay key context is not configured");
  }
  const peerKey = createPublicKey({
    key: Buffer.from(peerPublicKey, "base64"),
    format: "der",
    type: "spki",
  });
  return Buffer.from(
    hkdfSync(
      "sha256",
      diffieHellman({ privateKey, publicKey: peerKey }),
      Buffer.from("midnight-private-negotiation-v2", "utf8"),
      Buffer.from(`${sessionId}:${productCode}:buyer-seller`, "utf8"),
      32,
    ),
  );
};

type NegotiationPayload =
  | { kind: "proposal"; round: number; price: string }
  | { kind: "accept"; round: number; price: string }
  | { kind: "decline"; round: number }
  | { kind: "contract_ready"; contractAddress: string }
  | { kind: "price_opening"; price: string; priceRandomness: string };

type OutgoingPayload =
  | NegotiationPayload
  | { kind: "seller_key"; sellerKey: string };

const isNegotiationPayload = (
  value: unknown,
): value is NegotiationPayload => {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  if (payload.kind === "contract_ready") {
    return (
      Object.keys(payload).length === 2 &&
      typeof payload.contractAddress === "string" &&
      /^[a-z0-9_]{16,256}$/u.test(payload.contractAddress)
    );
  }
  if (payload.kind === "price_opening") {
    return (
      Object.keys(payload).length === 3 &&
      typeof payload.price === "string" &&
      /^[1-9]\d{0,19}$/u.test(payload.price) &&
      typeof payload.priceRandomness === "string" &&
      /^[a-f0-9]{64}$/u.test(payload.priceRandomness)
    );
  }
  if (
    !Number.isInteger(payload.round) ||
    (payload.round as number) < 1 ||
    (payload.round as number) > MAX_ROUNDS
  ) {
    return false;
  }
  if (payload.kind === "decline") {
    return Object.keys(payload).length === 2;
  }
  return (
    (payload.kind === "proposal" || payload.kind === "accept") &&
    Object.keys(payload).length === 3 &&
    typeof payload.price === "string" &&
    /^[1-9]\d{0,19}$/.test(payload.price)
  );
};

const relay = (payload: OutgoingPayload): void => {
  if (
    sessionId === undefined ||
    productCode === undefined ||
    sharedKey === undefined ||
    relayClient === undefined
  ) {
    throw new Error("seller relay channel is missing");
  }
  sentSequence += 1;
  const packet = encryptRelayPayload({
    sharedKey,
    metadata: {
      sessionId,
      productCode,
      sequence: sentSequence,
      sender: role,
      target: "buyer",
    },
    payload,
  });
  relayClient.sendPacket(packet);
};

const sendChainState = (state: "OPEN" | "SETTLED" | "CANCELLED"): void => {
  if (sessionId === undefined || chainContractAddress === undefined) {
    throw new Error("seller chain session is unavailable");
  }
  send({
    protocolVersion: PROTOCOL_VERSION,
    type: "CHAIN_TX_CONFIRMED",
    role,
    sessionId,
    contractAddress: chainContractAddress,
    state,
  });
};

const flushSellerKey = async (): Promise<void> => {
  if (
    !chainMode ||
    sellerKeySent ||
    sellerChainState === undefined ||
    sharedKey === undefined ||
    relayClient === undefined
  ) {
    return;
  }
  sellerKeySent = true;
  const contractModule = await import("@midnight-negotiation/negotiation-contract");
  relay({
    kind: "seller_key",
    sellerKey: Buffer.from(
      contractModule.publicKeyForSecret(sellerChainState.sellerSecretKey),
    ).toString("hex"),
  });
};

const tryJoinOnChain = async (): Promise<void> => {
  if (
    !chainMode ||
    chainJoinStarted ||
    pendingContractAddress === undefined ||
    sellerChainState === undefined ||
    chainWalletPromise === undefined ||
    sessionId === undefined ||
    chainContract !== undefined
  ) {
    return;
  }
  chainJoinStarted = true;
  const joinSession = sessionId;
  const contractAddress = pendingContractAddress;
  const privateState = sellerChainState;
  const [adapter, wallet] = await Promise.all([
    import("@midnight-negotiation/midnight-adapter"),
    chainWalletPromise,
  ]);
  if (roleStorage === undefined) throw new Error("seller key store is unavailable");
  const storage = roleStorage;
  const providers = await adapter.configureProviders(
    wallet,
    readChainConfig(),
    role,
    joinSession,
    { dataDir: storage.dataDir, password: storage.privateStatePassword },
  );
  // Recorded before joining so a crash still leaves a way back to the store.
  const record: SessionRecord = {
    role,
    sessionId: joinSession,
    network: adapter.LOCAL_NETWORK_ID,
    ...providers.storage,
    contractAddress,
    phase: "ACTIVE",
    updatedAt: new Date().toISOString(),
  };
  await adapter.saveSessionRecord(storage, record);
  const contract = await adapter.attachNegotiation(
    providers,
    contractAddress,
    privateState,
  );
  if (sessionId !== joinSession) return;
  await adapter.joinDeal(contract);
  if (sessionId !== joinSession) return;
  sessionRecord = record;
  chainContractAddress = contractAddress;
  chainProviders = providers;
  chainContract = contract;
  sendChainState("OPEN");
};

const settleOnChain = async (input: {
  price: string;
  priceRandomness: string;
}): Promise<void> => {
  if (
    !chainMode ||
    chainProviders === undefined ||
    chainContract === undefined ||
    chainContractAddress === undefined
  ) {
    return;
  }
  const [adapter, contractModule] = await Promise.all([
    import("@midnight-negotiation/midnight-adapter"),
    import("@midnight-negotiation/negotiation-contract"),
  ]);
  await adapter.setSellerPriceOpening(chainProviders, chainContractAddress, {
    agreedPrice: BigInt(input.price),
    priceRandomness: contractModule.hexToBytes(input.priceRandomness),
  });
  await adapter.settle(chainContract);
  sendChainState("SETTLED");
};

// Drops negotiation secrets held in memory once the session is final. This
// only releases references; it cannot erase copies the runtime already made.
const forgetSessionSecrets = (): void => {
  sellerMinPrice = undefined;
  sellerChainState = undefined;
  agreedPrice = undefined;
  privateKey = undefined;
  sharedKey = undefined;
  lastSentOffer = undefined;
  relayClient?.close();
  relayClient = undefined;
  sessionRecord = undefined;
};

// The runtime reads the chain itself: evidence is saved and verified before
// the private state is erased, and an unfinished deal keeps everything.
const finalizeOnChain = async (): Promise<void> => {
  if (!chainMode || roleStorage === undefined || sessionRecord === undefined) {
    throw new Error("seller session cannot be finalized");
  }
  const adapter = await import("@midnight-negotiation/midnight-adapter");
  const outcome = await adapter.finalizeRoleSession(
    roleStorage,
    readChainConfig(),
    sessionRecord,
  );
  switch (outcome.kind) {
    case "SETTLED_EVIDENCE_SAVED":
      emit("SETTLED", "SETTLEMENT_VERIFIED", "ROLE_LOCAL");
      emit("SETTLED", "EVIDENCE_SAVED", "ROLE_LOCAL");
      emit("SETTLED", "SESSION_CLEANED", "ROLE_LOCAL");
      forgetSessionSecrets();
      return;
    case "CANCELLED_CLEANED":
      emit("CANCELLED", "SESSION_CLEANED", "ROLE_LOCAL");
      forgetSessionSecrets();
      return;
    case "ALREADY_CLEANED":
      return;
    case "KEPT":
      emit(
        "ERROR",
        outcome.reason === "EVIDENCE_REJECTED"
          ? "SETTLEMENT_VERIFICATION_FAILED"
          : "SESSION_FINALIZE_PENDING",
        "ROLE_LOCAL",
      );
  }
};

const cancelOnChain = async (): Promise<void> => {
  if (!chainMode || chainContract === undefined || chainContractAddress === undefined) {
    return;
  }
  const adapter = await import("@midnight-negotiation/midnight-adapter");
  await adapter.cancelAsSeller(chainContract);
  sendChainState("CANCELLED");
};

const acceptPeerKey = (message: RelayPeerKey): void => {
  if (
    sessionId === undefined ||
    productCode === undefined ||
    message.sessionId !== sessionId ||
    message.productCode !== productCode ||
    message.role !== "buyer"
  ) {
    throw new Error("seller received a peer key for another room");
  }
  sharedKey = deriveSharedKey(message.publicKey);
  sellerKeySent = false;
  send({
    protocolVersion: PROTOCOL_VERSION,
    type: "RELAY_CHANNEL_READY",
    role,
    sessionId,
  });
  void flushSellerKey().catch(() => {
    if (sessionId !== undefined) {
      emit("ERROR", "CHAIN_OPERATION_FAILED", "ROLE_LOCAL");
    }
  });
};

const acceptRelayPacket = (packet: RelayPacket): void => {
  if (
    sessionId === undefined ||
    productCode === undefined ||
    sharedKey === undefined ||
    packet.sessionId !== sessionId ||
    packet.productCode !== productCode ||
    packet.sender !== "buyer" ||
    packet.target !== role ||
    packet.sequence <= receivedSequence
  ) {
    throw new Error("seller received an invalid or replayed relay packet");
  }
  const payload = decryptRelayPayload({ sharedKey, packet });
  if (!isNegotiationPayload(payload)) {
    throw new Error("seller received an invalid negotiation payload");
  }
  receivedSequence = packet.sequence;
  if (payload.kind === "contract_ready") {
    pendingContractAddress = payload.contractAddress;
    void tryJoinOnChain().catch(() => {
      if (sessionId !== undefined) {
        emit("ERROR", "CHAIN_OPERATION_FAILED", "ROLE_LOCAL");
      }
    });
    return;
  }
  if (payload.kind === "price_opening") {
    // The contract checks only the limits, not that this is the negotiated price.
    if (agreedPrice === undefined || payload.price !== agreedPrice) {
      emit("ERROR", "CHAIN_OPERATION_FAILED", "ROLE_LOCAL");
      void cancelOnChain().catch(() => {
        if (sessionId !== undefined) {
          emit("ERROR", "CHAIN_OPERATION_FAILED", "ROLE_LOCAL");
        }
      });
      return;
    }
    void settleOnChain(payload).catch(() => {
      if (sessionId !== undefined) {
        emit("ERROR", "CHAIN_OPERATION_FAILED", "ROLE_LOCAL");
      }
      return cancelOnChain().catch(() => undefined);
    });
    return;
  }
  if (sellerMinPrice === undefined) {
    throw new Error("seller received negotiation traffic before setting a limit");
  }
  if (agreedPrice !== undefined) {
    throw new Error("seller received negotiation traffic after agreeing on a price");
  }
  if (payload.kind === "accept") {
    if (
      lastSentOffer?.round !== payload.round ||
      lastSentOffer.price !== payload.price
    ) {
      throw new Error("Buyer accepted an unknown Seller offer");
    }
    agreedPrice = payload.price;
    return;
  }
  if (payload.kind === "decline") {
    throw new Error("Buyer cannot send a decline response");
  }
  void respondToProposal(payload).catch(() => {
    if (sessionId !== undefined) {
      emit("ERROR", "INVALID_RUNTIME_COMMAND", "ROLE_LOCAL");
    }
  });
};

const executeCandidate = (
  context: PublicNegotiationContext,
  candidate: NegotiationCandidate,
): void => {
  if (candidate.action === "accept") {
    agreedPrice = candidate.price;
    relay({
      kind: "accept",
      round: context.round,
      price: candidate.price,
    });
    return;
  }
  lastSentOffer = {
    round: context.round,
    price: candidate.price,
  };
  relay({
    kind: "proposal",
    round: context.round,
    price: candidate.price,
  });
};

const respondToProposal = async (input: {
  round: number;
  price: string;
}): Promise<void> => {
  if (
    productCode === undefined ||
    sellerMinPrice === undefined ||
    sharedKey === undefined ||
    !peerReady
  ) {
    throw new Error("seller negotiation is not ready");
  }
  const context: PublicNegotiationContext = {
    role,
    productCode,
    round: input.round,
    publicReferencePrice,
    currentOffer: {
      maker: "buyer",
      price: input.price,
    },
  };
  const policy = {
    role,
    minimumPrice: sellerMinPrice,
  } as const;
  const candidate = (await generateAllowedCandidate({
    provider: candidateProvider,
    context,
    policy,
  })) ?? generateLocalFallbackCandidate({ context, policy });
  if (candidate === undefined) {
    relay({
      kind: "decline",
      round: input.round,
    });
    return;
  }
  executeCandidate(context, candidate);
};

send({
  protocolVersion: PROTOCOL_VERSION,
  type: "RUNTIME_READY",
  role,
  pid: process.pid,
});

if (chainMode) {
  chainWalletPromise = initializeChainWallet().catch((error: unknown) => {
    send({
      protocolVersion: PROTOCOL_VERSION,
      type: "RUNTIME_BOOT_FAILED",
      role,
      reason: error instanceof Error ? error.message : "Midnight wallet bootstrap failed",
    });
    throw error;
  });
  // Later awaits still see the rejection; this only stops Node from exiting on it.
  chainWalletPromise.catch(() => undefined);
}

process.on("message", (raw: unknown) => {
  try {
    const command = parseRuntimeCommand(raw, role);
    switch (command.type) {
      case "JOIN_ROOM": {
        relayClient?.close();
        sessionId = command.sessionId;
        productCode = command.productCode;
        sellerMinPrice = undefined;
        sharedKey = undefined;
        sentSequence = 0;
        receivedSequence = 0;
        peerReady = false;
        lastSentOffer = undefined;
        chainProviders = undefined;
        chainContract = undefined;
        chainContractAddress = undefined;
        pendingContractAddress = undefined;
        sellerChainState = undefined;
        chainJoinStarted = false;
        sellerKeySent = false;
        agreedPrice = undefined;
        sessionRecord = undefined;
        const keyPair = generateKeyPairSync("x25519");
        privateKey = keyPair.privateKey;
        emit("ROOM_JOINED", "ROOM_JOINED", "ROLE_LOCAL");
        const relayHost = process.env.ROOM_RELAY_HOST;
        const relayPort = Number(process.env.ROOM_RELAY_PORT);
        const relayToken = process.env.ROOM_RELAY_TOKEN;
        if (
          relayHost === undefined ||
          relayToken === undefined ||
          !Number.isInteger(relayPort)
        ) {
          throw new Error("seller Room Relay configuration is missing");
        }
        relayClient = new RoomRelayClient({
          host: relayHost,
          port: relayPort,
          role,
          authToken: relayToken,
          onPeerKey: acceptPeerKey,
          onPacket: acceptRelayPacket,
          onError: () => {
            if (sessionId !== undefined) {
              emit("ERROR", "RELAY_CHANNEL_ERROR", "ROLE_LOCAL");
            }
          },
        });
        void relayClient.register({
          sessionId: command.sessionId,
          productCode: command.productCode,
          publicKey: keyPair.publicKey
            .export({ format: "der", type: "spki" })
            .toString("base64"),
        }).catch(() => {
          if (sessionId !== undefined) {
            emit("ERROR", "RELAY_CHANNEL_ERROR", "ROLE_LOCAL");
          }
        });
        break;
      }
      case "SET_LIMIT": {
        if (sessionId !== command.sessionId || productCode === undefined) {
          throw new Error("seller room is not configured");
        }
        if (sellerChainState !== undefined) {
          throw new Error("seller limit is already locked");
        }
        sellerMinPrice = BigInt(command.limitKrw);
        const sellerLimitRandomness = new Uint8Array(randomBytes(32));
        sellerChainState = {
          role,
          sellerMinPrice,
          sellerLimitRandomness,
          sellerSecretKey: new Uint8Array(randomBytes(32)),
        };
        void flushSellerKey().catch(() => {
          if (sessionId !== undefined) {
            emit("ERROR", "CHAIN_OPERATION_FAILED", "ROLE_LOCAL");
          }
        });
        createHash("sha256")
          .update(command.limitKrw)
          .update(sellerLimitRandomness)
          .digest();
        emit("LIMIT_LOCKED", "SELLER_LIMIT_LOCKED", "ROLE_LOCAL");
        emit(
          "COMMITMENT_CREATED",
          "SELLER_COMMITMENT_CREATED",
          "ROLE_LOCAL",
        );
        emit("COMMITMENT_CREATED", "DEAL_JOINED", "ROLE_LOCAL");
        emit(
          "WAITING_PEER",
          "WAITING_BUYER_COMMITMENT",
          "ROLE_LOCAL",
          { replaceKey: "seller-peer-commitment" },
        );
        if (chainMode) {
          void tryJoinOnChain().catch(() => {
            if (sessionId !== undefined) {
              emit("ERROR", "CHAIN_OPERATION_FAILED", "ROLE_LOCAL");
            }
          });
        }
        break;
      }
      case "FINALIZE_SESSION":
        if (sessionId !== command.sessionId) {
          throw new Error("seller settlement session does not match");
        }
        void finalizeOnChain().catch(() => {
          if (sessionId !== undefined) {
            emit("ERROR", "SESSION_FINALIZE_PENDING", "ROLE_LOCAL");
          }
        });
        break;
      case "CHAIN_FUNDED":
        chainFundedResolve?.();
        chainFundedResolve = undefined;
        break;
      case "PEER_READY":
        if (sessionId !== command.sessionId || sellerMinPrice === undefined) {
          throw new Error("seller limit is not configured");
        }
        peerReady = true;
        break;
      case "START_RUNTIME":
        if (sellerMinPrice === undefined || sharedKey === undefined || !peerReady) {
          throw new Error("seller negotiation cannot start");
        }
        break;
      case "SHUTDOWN_RUNTIME":
        if (sessionId !== undefined) {
          emit("STOPPED", "RUNTIME_STOPPED", "ROLE_LOCAL");
        }
        sellerMinPrice = undefined;
        privateKey = undefined;
        sharedKey = undefined;
        relayClient?.close();
        relayClient = undefined;
        sentSequence = 0;
        receivedSequence = 0;
        peerReady = false;
        lastSentOffer = undefined;
        chainProviders = undefined;
        chainContract = undefined;
        chainContractAddress = undefined;
        pendingContractAddress = undefined;
        sellerChainState = undefined;
        chainJoinStarted = false;
        sellerKeySent = false;
        agreedPrice = undefined;
        sessionRecord = undefined;
        productCode = undefined;
        sessionId = undefined;
        if (chainWalletPromise === undefined) {
          setImmediate(() => process.disconnect());
        } else {
          void chainWalletPromise
            .then(({ wallet }) => wallet.stop())
            .catch(() => undefined)
            .finally(() => process.disconnect());
        }
        break;
      case "CONFIGURE_OBSERVER":
      case "OBSERVE_CHAIN_STATE":
      case "PUBLISH_PUBLIC_STATE":
        throw new Error("observer command reached seller runtime");
    }
  } catch {
    if (sessionId !== undefined) {
      emit("ERROR", "INVALID_RUNTIME_COMMAND", "ROLE_LOCAL");
    }
  }
});
