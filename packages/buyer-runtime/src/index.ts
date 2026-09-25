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
  deriveSessionPriceOffset,
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
import type { BuyerPrivateState } from "@midnight-negotiation/negotiation-contract";

const role = "buyer" as const;
const MAX_ROUNDS = 10;
const publicReferencePrice =
  process.env.NEGOTIATION_REFERENCE_PRICE_KRW ?? "100000";
const candidateProvider = createCandidateProviderFromEnvironment();
const chainMode = process.env.MIDNIGHT_MODE === "local";

let sessionId: string | undefined;
let productCode: string | undefined;
let buyerMaxPrice: bigint | undefined;
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
let buyerChainState: BuyerPrivateState | undefined;
let chainDealId: Uint8Array | undefined;
let chainContractReadyPending = false;
let chainDeployStarted = false;
let peerSellerKey: Uint8Array | undefined;
let roleStorage: RoleStorage | undefined;
let sessionRecord: SessionRecord | undefined;
let peerReady = false;
let negotiationStarted = false;
let negotiationFinished = false;
let lastSentOffer:
  | {
      round: number;
      price: string;
    }
  | undefined;

const send = (message: RuntimeMessage): void => {
  if (process.send === undefined) {
    throw new Error("buyer runtime requires an IPC parent");
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
      throw new Error(`buyer Midnight configuration is missing ${key}`);
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
          `[buyer] recovered sessions: ${results
            .map(({ outcome }) => ("reason" in outcome ? `${outcome.kind}:${outcome.reason}` : outcome.kind))
            .join(", ")}`,
        );
      }
    })
    .catch(() => console.error("[buyer] session recovery failed; records kept"));
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
  options: {
    replaceKey?: string;
    correlationId?: string;
  } = {},
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
    throw new Error("buyer relay key context is not configured");
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
  | { kind: "price_opening"; price: string; priceRandomness: string }
  | { kind: "seller_key"; sellerKey: string };

const isNegotiationPayload = (
  value: unknown,
): value is NegotiationPayload => {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  if (payload.kind === "seller_key") {
    return (
      Object.keys(payload).length === 2 &&
      typeof payload.sellerKey === "string" &&
      /^[a-f0-9]{64}$/u.test(payload.sellerKey)
    );
  }
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

const relay = (payload: NegotiationPayload): void => {
  if (
    sessionId === undefined ||
    productCode === undefined ||
    sharedKey === undefined ||
    relayClient === undefined
  ) {
    throw new Error("buyer relay channel is missing");
  }
  sentSequence += 1;
  const packet = encryptRelayPayload({
    sharedKey,
    metadata: {
      sessionId,
      productCode,
      sequence: sentSequence,
      sender: role,
      target: "seller",
    },
    payload,
  });
  relayClient.sendPacket(packet);
};

const sendChainState = (
  state: "WAITING_SELLER" | "AUTHORIZED" | "CANCELLED",
): void => {
  if (sessionId === undefined || chainContractAddress === undefined) {
    throw new Error("buyer chain session is unavailable");
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

const flushContractReady = (): void => {
  if (
    !chainContractReadyPending ||
    chainContractAddress === undefined ||
    sharedKey === undefined ||
    relayClient === undefined
  ) {
    return;
  }
  relay({
    kind: "contract_ready",
    contractAddress: chainContractAddress,
  });
  chainContractReadyPending = false;
};

const deployOnChain = async (): Promise<void> => {
  if (
    !chainMode ||
    chainDeployStarted ||
    chainWalletPromise === undefined ||
    buyerChainState === undefined ||
    peerSellerKey === undefined ||
    chainDealId === undefined ||
    sessionId === undefined
  ) {
    return;
  }
  chainDeployStarted = true;
  const deploySession = sessionId;
  const privateState = buyerChainState;
  const dealId = chainDealId;
  const sellerKey = peerSellerKey;
  const [adapter, contractModule, wallet] = await Promise.all([
    import("@midnight-negotiation/midnight-adapter"),
    import("@midnight-negotiation/negotiation-contract"),
    chainWalletPromise,
  ]);
  if (roleStorage === undefined) throw new Error("buyer key store is unavailable");
  const storage = roleStorage;
  const providers = await adapter.configureProviders(
    wallet,
    readChainConfig(),
    role,
    deploySession,
    { dataDir: storage.dataDir, password: storage.privateStatePassword },
  );
  // Recorded before deployment so a crash still leaves a way back to the store.
  let record: SessionRecord = {
    role,
    sessionId: deploySession,
    network: adapter.LOCAL_NETWORK_ID,
    ...providers.storage,
    dealId: Buffer.from(dealId).toString("hex"),
    phase: "ACTIVE",
    updatedAt: new Date().toISOString(),
  };
  await adapter.saveSessionRecord(storage, record);
  const buyerKey = contractModule.publicKeyForSecret(
    privateState.buyerSecretKey,
  );
  const deployed = await adapter.deployNegotiation(providers, privateState, {
    dealId,
    buyerKey,
    sellerKey,
    buyerCommitment: contractModule.limitCommitment(
      dealId,
      "negotiation:buyer:",
      buyerKey,
      privateState.buyerMaxPrice,
      privateState.buyerLimitRandomness,
    ),
  });
  record = {
    ...record,
    contractAddress: deployed.deployTxData.public.contractAddress,
    updatedAt: new Date().toISOString(),
  };
  await adapter.saveSessionRecord(storage, record);
  if (sessionId !== deploySession) return;
  sessionRecord = record;
  chainProviders = providers;
  chainContract = deployed;
  chainContractAddress = deployed.deployTxData.public.contractAddress;
  sendChainState("WAITING_SELLER");
  chainContractReadyPending = true;
  flushContractReady();
};

const authorizeOnChain = async (agreedAmount: string): Promise<void> => {
  if (
    !chainMode ||
    chainProviders === undefined ||
    chainContract === undefined ||
    chainContractAddress === undefined ||
    buyerChainState === undefined
  ) {
    return;
  }
  const adapter = await import("@midnight-negotiation/midnight-adapter");
  buyerChainState = {
    ...buyerChainState,
    agreedPrice: BigInt(agreedAmount),
  };
  chainProviders.privateStateProvider.setContractAddress(chainContractAddress);
  await chainProviders.privateStateProvider.set(
    adapter.NegotiationPrivateStateId,
    buyerChainState,
  );
  await adapter.authorizeHiddenPrice(chainContract);
  sendChainState("AUTHORIZED");
  relay({
    kind: "price_opening",
    price: agreedAmount,
    priceRandomness: Buffer.from(
      buyerChainState.priceRandomness,
    ).toString("hex"),
  });
};

const cancelOnChain = async (): Promise<void> => {
  if (
    !chainMode ||
    chainContract === undefined ||
    chainContractAddress === undefined
  ) {
    return;
  }
  const adapter = await import("@midnight-negotiation/midnight-adapter");
  await adapter.cancelAsBuyer(chainContract);
  sendChainState("CANCELLED");
};

// Drops negotiation secrets held in memory once the session is final. This
// only releases references; it cannot erase copies the runtime already made.
const forgetSessionSecrets = (): void => {
  buyerMaxPrice = undefined;
  buyerChainState = undefined;
  privateKey = undefined;
  sharedKey = undefined;
  lastSentOffer = undefined;
  peerSellerKey = undefined;
  relayClient?.close();
  relayClient = undefined;
  sessionRecord = undefined;
};

// The runtime reads the chain itself: evidence is saved and verified before
// the private state is erased, and an unfinished deal keeps everything.
const finalizeOnChain = async (): Promise<void> => {
  if (!chainMode || roleStorage === undefined || sessionRecord === undefined) {
    throw new Error("buyer session cannot be finalized");
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

const acceptPeerKey = (message: RelayPeerKey): void => {
  if (
    sessionId === undefined ||
    productCode === undefined ||
    message.sessionId !== sessionId ||
    message.productCode !== productCode ||
    message.role !== "seller"
  ) {
    throw new Error("buyer received a peer key for another room");
  }
  sharedKey = deriveSharedKey(message.publicKey);
  send({
    protocolVersion: PROTOCOL_VERSION,
    type: "RELAY_CHANNEL_READY",
    role,
    sessionId,
  });
  flushContractReady();
};

const acceptRelayPacket = (packet: RelayPacket): void => {
  if (
    sessionId === undefined ||
    productCode === undefined ||
    sharedKey === undefined ||
    packet.sessionId !== sessionId ||
    packet.productCode !== productCode ||
    packet.sender !== "seller" ||
    packet.target !== role ||
    packet.sequence <= receivedSequence
  ) {
    throw new Error("buyer received an invalid or replayed relay packet");
  }
  const payload = decryptRelayPayload({ sharedKey, packet });
  if (!isNegotiationPayload(payload)) {
    throw new Error("buyer received an invalid negotiation payload");
  }
  if (payload.kind === "contract_ready" || payload.kind === "price_opening") {
    throw new Error("buyer received a Seller-forbidden chain control payload");
  }
  if (
    payload.kind === "seller_key" &&
    peerSellerKey !== undefined &&
    Buffer.from(peerSellerKey).toString("hex") !== payload.sellerKey
  ) {
    throw new Error("buyer received a conflicting Seller key");
  }
  receivedSequence = packet.sequence;
  if (payload.kind === "seller_key") {
    if (peerSellerKey !== undefined) return;
    peerSellerKey = Uint8Array.from(Buffer.from(payload.sellerKey, "hex"));
    void deployOnChain().catch(() => {
      if (sessionId !== undefined) {
        emit("ERROR", "CHAIN_OPERATION_FAILED", "ROLE_LOCAL");
      }
    });
    return;
  }
  if (payload.kind === "accept") {
    if (
      lastSentOffer?.round !== payload.round ||
      lastSentOffer.price !== payload.price
    ) {
      throw new Error("seller accepted an unknown Buyer offer");
    }
    publishOutcome({
      result: "SETTLED",
      agreedAmount: payload.price,
    });
    return;
  }
  if (payload.kind === "decline") {
    if (lastSentOffer?.round !== payload.round) {
      throw new Error("seller declined an unknown Buyer offer");
    }
    if (payload.round >= MAX_ROUNDS) {
      publishOutcome({ result: "CANCELLED" });
      return;
    }
    void generateAndExecute({
      role,
      productCode,
      round: payload.round + 1,
    }).catch(() => {
      if (sessionId !== undefined) {
        emit("ERROR", "INVALID_RUNTIME_COMMAND", "ROLE_LOCAL");
      }
    });
    return;
  }
  void generateAndExecute({
    role,
    productCode,
    round: payload.round,
    currentOffer: {
      maker: "seller",
      price: payload.price,
    },
  }).catch(() => {
    if (sessionId !== undefined) {
      emit("ERROR", "INVALID_RUNTIME_COMMAND", "ROLE_LOCAL");
    }
  });
};

const publishOutcome = (
  result:
    | { result: "SETTLED"; agreedAmount: string }
    | { result: "CANCELLED" },
): void => {
  if (sessionId === undefined || negotiationFinished) return;
  negotiationFinished = true;
  send({
    protocolVersion: PROTOCOL_VERSION,
    type: "NEGOTIATION_OUTCOME",
    role,
    sessionId,
    ...result,
  });
  if (chainMode) {
    const operation =
      result.result === "SETTLED"
        ? authorizeOnChain(result.agreedAmount)
        : cancelOnChain();
    void operation.catch(() => {
      if (sessionId !== undefined) {
        emit("ERROR", "CHAIN_OPERATION_FAILED", "ROLE_LOCAL");
      }
    });
  }
};

const executeCandidate = (
  context: PublicNegotiationContext,
  candidate: NegotiationCandidate,
): void => {
  if (candidate.action === "accept") {
    relay({
      kind: "accept",
      round: context.round,
      price: candidate.price,
    });
    publishOutcome({
      result: "SETTLED",
      agreedAmount: candidate.price,
    });
    return;
  }

  const nextRound =
    context.currentOffer === undefined ? context.round : context.round + 1;
  if (nextRound > MAX_ROUNDS) {
    publishOutcome({ result: "CANCELLED" });
    return;
  }
  lastSentOffer = { round: nextRound, price: candidate.price };
  relay({
    kind: "proposal",
    round: nextRound,
    price: candidate.price,
  });
};

const generateAndExecute = async (
  context: PublicNegotiationContext,
): Promise<void> => {
  if (
    sessionId === undefined ||
    productCode === undefined ||
    buyerMaxPrice === undefined ||
    sharedKey === undefined ||
    !peerReady ||
    negotiationFinished
  ) {
    throw new Error("buyer negotiation is not ready");
  }

  const policy = {
    role,
    maximumPrice: buyerMaxPrice,
  } as const;
  const publicContext: PublicNegotiationContext = {
    ...context,
    publicReferencePrice,
  };
  const priceOffset = deriveSessionPriceOffset({
    sharedKey,
    sessionId,
    productCode,
    publicReferencePrice,
  });
  const candidate = (await generateAllowedCandidate({
    provider: candidateProvider,
    priceOffset,
    context: publicContext,
    policy,
  })) ??
    generateLocalFallbackCandidate({
      context: publicContext,
      policy,
      priceOffset,
    });
  if (candidate === undefined) {
    publishOutcome({ result: "CANCELLED" });
    return;
  }
  executeCandidate(publicContext, candidate);
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
        buyerMaxPrice = undefined;
        sharedKey = undefined;
        sentSequence = 0;
        receivedSequence = 0;
        peerReady = false;
        negotiationStarted = false;
        negotiationFinished = false;
        lastSentOffer = undefined;
        chainContractReadyPending = false;
        chainDealId = new Uint8Array(
          createHash("sha256")
            .update(`midnight-negotiation:${PROTOCOL_VERSION}:${command.productCode}:`)
            .update(randomBytes(32))
            .digest(),
        );
        buyerChainState = undefined;
        chainProviders = undefined;
        chainContract = undefined;
        chainContractAddress = undefined;
        chainDeployStarted = false;
        peerSellerKey = undefined;
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
          throw new Error("buyer Room Relay configuration is missing");
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
          throw new Error("buyer room is not configured");
        }
        if (buyerChainState !== undefined) {
          throw new Error("buyer limit is already locked");
        }
        buyerMaxPrice = BigInt(command.limitKrw);
        const buyerLimitRandomness = new Uint8Array(randomBytes(32));
        const buyerSecretKey = new Uint8Array(randomBytes(32));
        buyerChainState = {
          role,
          buyerMaxPrice,
          buyerLimitRandomness,
          buyerSecretKey,
          agreedPrice: 0n,
          priceRandomness: new Uint8Array(randomBytes(32)),
        };
        createHash("sha256")
          .update(command.limitKrw)
          .update(buyerLimitRandomness)
          .digest();
        emit("LIMIT_LOCKED", "BUYER_LIMIT_LOCKED", "ROLE_LOCAL");
        emit(
          "COMMITMENT_CREATED",
          "BUYER_COMMITMENT_CREATED",
          "ROLE_LOCAL",
        );
        emit("COMMITMENT_CREATED", "DEAL_CREATED", "ROLE_LOCAL");
        emit(
          "WAITING_PEER",
          "WAITING_SELLER_COMMITMENT",
          "ROLE_LOCAL",
          { replaceKey: "buyer-peer-commitment" },
        );
        if (chainMode) {
          void deployOnChain().catch(() => {
            if (sessionId !== undefined) {
              emit("ERROR", "CHAIN_OPERATION_FAILED", "ROLE_LOCAL");
            }
          });
        }
        break;
      }
      case "FINALIZE_SESSION":
        if (sessionId !== command.sessionId) {
          throw new Error("buyer settlement session does not match");
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
        if (sessionId !== command.sessionId || buyerMaxPrice === undefined) {
          throw new Error("buyer limit is not configured");
        }
        peerReady = true;
        break;
      case "START_RUNTIME":
        if (
          buyerMaxPrice === undefined ||
          sharedKey === undefined ||
          !peerReady ||
          negotiationStarted
        ) {
          throw new Error("buyer negotiation cannot start");
        }
        negotiationStarted = true;
        setTimeout(() => {
          if (productCode === undefined) return;
          void generateAndExecute({
            role,
            productCode,
            round: 1,
          }).catch(() => {
            if (sessionId !== undefined) {
              emit("ERROR", "INVALID_RUNTIME_COMMAND", "ROLE_LOCAL");
            }
          });
        }, 1_100);
        break;
      case "SHUTDOWN_RUNTIME":
        if (sessionId !== undefined) {
          emit("STOPPED", "RUNTIME_STOPPED", "ROLE_LOCAL");
        }
        buyerMaxPrice = undefined;
        privateKey = undefined;
        sharedKey = undefined;
        relayClient?.close();
        relayClient = undefined;
        sentSequence = 0;
        receivedSequence = 0;
        peerReady = false;
        negotiationStarted = false;
        negotiationFinished = false;
        lastSentOffer = undefined;
        chainContractReadyPending = false;
        chainDealId = undefined;
        buyerChainState = undefined;
        chainProviders = undefined;
        chainContract = undefined;
        chainContractAddress = undefined;
        chainDeployStarted = false;
        peerSellerKey = undefined;
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
        throw new Error("observer command reached buyer runtime");
    }
  } catch {
    if (sessionId !== undefined) {
      emit("ERROR", "INVALID_RUNTIME_COMMAND", "ROLE_LOCAL");
    }
  }
});
