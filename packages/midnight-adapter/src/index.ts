import * as ledger from "@midnight-ntwrk/ledger-v8";
import { unshieldedToken } from "@midnight-ntwrk/ledger-v8";
import {
  Negotiation,
  type NegotiationPrivateState,
  type SellerPriceOpening,
  withSellerPriceOpening,
  witnesses,
} from "@midnight-negotiation/negotiation-contract";
import { CompiledContract, type ProvableCircuitId } from "@midnight-ntwrk/compact-js";
import {
  deployContract,
  findDeployedContract,
  type DeployedContract,
  type FoundContract,
} from "@midnight-ntwrk/midnight-js/contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import {
  getNetworkId,
  setNetworkId,
} from "@midnight-ntwrk/midnight-js/network-id";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import type {
  FinalizedTxData,
  MidnightProvider,
  MidnightProviders,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js/types";
import {
  assertIsContractAddress,
} from "@midnight-ntwrk/midnight-js/utils";
import {
  MidnightBech32m,
  UnshieldedAddress,
} from "@midnight-ntwrk/wallet-sdk-address-format";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
  type UnshieldedKeystore,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import {
  finalizeSession,
  privateStatePassword,
  recoverSessions,
  resolveDataDir,
  selectKeyStore,
  writeSessionRecord,
  type FinalizeOutcome,
  type KeyStore,
  type PublicDealState,
  type SessionRecord,
  type SessionStore,
} from "@midnight-negotiation/evidence";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import * as Rx from "rxjs";
import { WebSocket } from "ws";

export type MidnightLocalConfig = {
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
};

export type RuntimeRole = "buyer" | "seller";
export const NegotiationPrivateStateId = "negotiationPrivateState";
export const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

type NegotiationContract = Negotiation.Contract<NegotiationPrivateState>;
type NegotiationCircuits = ProvableCircuitId<NegotiationContract>;
export type NegotiationProviders = MidnightProviders<
  NegotiationCircuits,
  typeof NegotiationPrivateStateId,
  NegotiationPrivateState
>;
export type DeployedNegotiationContract =
  | DeployedContract<NegotiationContract>
  | FoundContract<NegotiationContract>;

export type WalletContext = {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
};

const zkConfigPath = fileURLToPath(
  new URL("../../negotiation-contract/src/managed/negotiation", import.meta.url),
);

// GraphQL subscriptions used by the Wallet SDK require a WebSocket global.
// @ts-expect-error The SDK expects the browser-compatible WebSocket surface.
globalThis.WebSocket = WebSocket;

const compiledContract = CompiledContract.make(
  "negotiation",
  Negotiation.Contract,
).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

export const LOCAL_NETWORK_ID = "undeployed";
export const useUndeployedNetwork = (): void => setNetworkId(LOCAL_NETWORK_ID);

const deriveKeysFromSeed = (seed: string) => {
  if (!/^[0-9a-f]{64}$/u.test(seed)) {
    throw new Error("wallet seed must contain 64 lowercase hex characters");
  }
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hdWallet.type !== "seedOk") {
    throw new Error("failed to initialize HD wallet");
  }
  const derived = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== "keysDerived") {
    throw new Error("failed to derive wallet keys");
  }
  hdWallet.hdWallet.clear();
  return derived.keys;
};

export const getUnshieldedAddressForSeed = (seed: string): string => {
  const keys = deriveKeysFromSeed(seed);
  return createKeystore(
    keys[Roles.NightExternal],
    getNetworkId(),
  ).getBech32Address().toString();
};

const shieldedConfig = (config: MidnightLocalConfig) => ({
  networkId: getNetworkId(),
  indexerClientConnection: {
    indexerHttpUrl: config.indexer,
    indexerWsUrl: config.indexerWS,
  },
  provingServerUrl: new URL(config.proofServer),
  relayURL: new URL(config.node.replace(/^http/u, "ws")),
});

const unshieldedConfig = (config: MidnightLocalConfig) => ({
  networkId: getNetworkId(),
  indexerClientConnection: {
    indexerHttpUrl: config.indexer,
    indexerWsUrl: config.indexerWS,
  },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
});

const dustConfig = (config: MidnightLocalConfig) => ({
  networkId: getNetworkId(),
  costParameters: {
    additionalFeeOverhead: 300_000_000_000_000n,
    feeBlocksMargin: 5,
  },
  indexerClientConnection: {
    indexerHttpUrl: config.indexer,
    indexerWsUrl: config.indexerWS,
  },
  provingServerUrl: new URL(config.proofServer),
  relayURL: new URL(config.node.replace(/^http/u, "ws")),
});

export const waitForWalletSync = (wallet: WalletFacade) =>
  Rx.firstValueFrom(wallet.state().pipe(Rx.filter((state) => state.isSynced)));

export const waitForWalletFunds = (wallet: WalletFacade): Promise<bigint> =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.filter((state) => state.isSynced),
      Rx.map((state) => state.unshielded.balances[unshieldedToken().raw] ?? 0n),
      Rx.filter((balance) => balance > 0n),
    ),
  );

export const buildWallet = async (
  config: MidnightLocalConfig,
  seed: string,
): Promise<WalletContext> => {
  const keys = deriveKeysFromSeed(seed);
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(
    keys[Roles.NightExternal],
    getNetworkId(),
  );
  const configuration = {
    ...shieldedConfig(config),
    ...unshieldedConfig(config),
    ...dustConfig(config),
  };
  const wallet = await WalletFacade.init({
    configuration,
    shielded: (walletConfig) =>
      ShieldedWallet(walletConfig).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (walletConfig) =>
      UnshieldedWallet(walletConfig).startWithPublicKey(
        PublicKey.fromKeyStore(unshieldedKeystore),
      ),
    dust: (walletConfig) =>
      DustWallet(walletConfig).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  await waitForWalletSync(wallet);
  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

const DUST_REGISTRATION_ATTEMPTS = 6;
const DUST_REGISTRATION_RETRY_MS = 5_000;
const DUST_AVAILABLE_TIMEOUT_MS = 180_000;

// The wallet wraps the node's RpcError inside an Effect FiberFailure whose inner
// cause is held under a Symbol, so inspect the whole structure rather than `.cause`.
const isBalanceCheckOverspend = (error: unknown): boolean =>
  /Custom error: 138\b/u.test(inspect(error, { depth: 12 }));

const registerNightForDust = async (context: WalletContext): Promise<void> => {
  for (let attempt = 1; ; attempt += 1) {
    const state = await waitForWalletSync(context.wallet);
    if (state.dust.balance(new Date()) > 0n) return;
    const coins = state.unshielded.availableCoins.filter(
      (coin) => coin.meta?.registeredForDustGeneration !== true,
    );
    if (coins.length === 0) break;
    try {
      const recipe = await context.wallet.registerNightUtxosForDustGeneration(
        coins,
        context.unshieldedKeystore.getPublicKey(),
        (payload) => context.unshieldedKeystore.signData(payload),
      );
      await context.wallet.submitTransaction(
        await context.wallet.finalizeRecipe(recipe),
      );
      break;
    } catch (error) {
      // The registration fee is paid from DUST the new NIGHT UTXO has generated since
      // creation, so a just-received UTXO can overspend (node error 138) until it ages.
      if (!isBalanceCheckOverspend(error) || attempt >= DUST_REGISTRATION_ATTEMPTS) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, DUST_REGISTRATION_RETRY_MS));
    }
  }
  await Rx.firstValueFrom(
    context.wallet.state().pipe(
      Rx.filter((next) => next.isSynced && next.dust.balance(new Date()) > 0n),
      Rx.timeout({ first: DUST_AVAILABLE_TIMEOUT_MS }),
    ),
  );
};

export const prepareFundedWallet = async (
  config: MidnightLocalConfig,
  seed: string,
): Promise<WalletContext> => {
  const context = await buildWallet(config, seed);
  const state = await waitForWalletSync(context.wallet);
  if ((state.unshielded.balances[unshieldedToken().raw] ?? 0n) === 0n) {
    await waitForWalletFunds(context.wallet);
  }
  await registerNightForDust(context);
  return context;
};

export const prepareWalletForTransactions = async (
  context: WalletContext,
): Promise<void> => {
  await waitForWalletFunds(context.wallet);
  await registerNightForDust(context);
};

export const fundWallet = async (
  funder: WalletContext,
  receiverAddress: string,
  amount: bigint,
): Promise<string> => {
  if (amount <= 0n) throw new Error("wallet funding amount must be positive");
  const receiver = MidnightBech32m.parse(receiverAddress).decode(
    UnshieldedAddress,
    getNetworkId(),
  );
  const recipe = await funder.wallet.transferTransaction(
    [
      {
        type: "unshielded",
        outputs: [
          {
            type: unshieldedToken().raw,
            receiverAddress: receiver,
            amount,
          },
        ],
      },
    ],
    {
      shieldedSecretKeys: funder.shieldedSecretKeys,
      dustSecretKey: funder.dustSecretKey,
    },
    { ttl: new Date(Date.now() + 30 * 60 * 1000) },
  );
  const signed = await funder.wallet.signRecipe(
    recipe,
    (payload) => funder.unshieldedKeystore.signData(payload),
  );
  return funder.wallet.submitTransaction(
    await funder.wallet.finalizeRecipe(signed),
  );
};

const signTransactionIntents = (
  tx: { intents?: Map<number, any> | undefined },
  sign: (payload: Uint8Array) => ledger.Signature,
  proofMarker: "proof" | "pre-proof",
): void => {
  if (tx.intents === undefined) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (intent === undefined) continue;
    const cloned = ledger.Intent.deserialize<
      ledger.SignatureEnabled,
      ledger.Proofish,
      ledger.PreBinding
    >("signature", proofMarker, "pre-binding", intent.serialize());
    const signature = sign(cloned.signatureData(segment));
    if (cloned.fallibleUnshieldedOffer !== undefined) {
      cloned.fallibleUnshieldedOffer =
        cloned.fallibleUnshieldedOffer.addSignatures(
          cloned.fallibleUnshieldedOffer.inputs.map(
            (_input, index) =>
              cloned.fallibleUnshieldedOffer?.signatures.at(index) ?? signature,
          ),
        );
    }
    if (cloned.guaranteedUnshieldedOffer !== undefined) {
      cloned.guaranteedUnshieldedOffer =
        cloned.guaranteedUnshieldedOffer.addSignatures(
          cloned.guaranteedUnshieldedOffer.inputs.map(
            (_input, index) =>
              cloned.guaranteedUnshieldedOffer?.signatures.at(index) ?? signature,
          ),
        );
    }
    tx.intents.set(segment, cloned);
  }
};

const createWalletProvider = async (
  context: WalletContext,
): Promise<WalletProvider & MidnightProvider> => {
  const state = await waitForWalletSync(context.wallet);
  return {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () =>
      state.shielded.encryptionPublicKey.toHexString(),
    balanceTx: async (transaction, ttl) => {
      const recipe = await context.wallet.balanceUnboundTransaction(
        transaction,
        {
          shieldedSecretKeys: context.shieldedSecretKeys,
          dustSecretKey: context.dustSecretKey,
        },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const sign = (payload: Uint8Array) =>
        context.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, sign, "proof");
      if (recipe.balancingTransaction !== undefined) {
        signTransactionIntents(
          recipe.balancingTransaction,
          sign,
          "pre-proof",
        );
      }
      return context.wallet.finalizeRecipe(recipe);
    },
    submitTx: (transaction) =>
      context.wallet.submitTransaction(transaction) as Promise<string>,
  };
};

export type SessionStorage = {
  privateStateDb: string;
  storeName: string;
  accountId: string;
};

const openPrivateStateProvider = (storage: SessionStorage, password: string) =>
  levelPrivateStateProvider<typeof NegotiationPrivateStateId>({
    midnightDbName: storage.privateStateDb,
    privateStateStoreName: storage.storeName,
    accountId: storage.accountId,
    privateStoragePasswordProvider: () => password,
  });

// The storage password comes from the role's key store, never from public key
// material. Each role gets its own database so the two runtimes never contend
// for the same LevelDB lock.
export const configureProviders = async (
  context: WalletContext,
  config: MidnightLocalConfig,
  role: RuntimeRole,
  sessionId: string,
  storageInput: { dataDir: string; password: string },
): Promise<NegotiationProviders & { storage: SessionStorage }> => {
  const walletProvider = await createWalletProvider(context);
  const zkConfigProvider =
    new NodeZkConfigProvider<NegotiationCircuits>(zkConfigPath);
  const accountId = walletProvider.getCoinPublicKey();
  const storage: SessionStorage = {
    privateStateDb: join(storageInput.dataDir, "private-state", role),
    storeName: `negotiation-${role}-${sessionId}-${accountId.slice(0, 16)}`,
    accountId,
  };
  return {
    storage,
    privateStateProvider: openPrivateStateProvider(storage, storageInput.password),
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(
      config.proofServer,
      zkConfigProvider,
    ),
    walletProvider,
    midnightProvider: walletProvider,
  };
};

export const deployNegotiation = (
  providers: NegotiationProviders,
  privateState: NegotiationPrivateState,
  input: {
    dealId: Uint8Array;
    buyerKey: Uint8Array;
    sellerKey: Uint8Array;
    buyerCommitment: Uint8Array;
  },
): Promise<DeployedNegotiationContract> =>
  deployContract(providers, {
    compiledContract,
    privateStateId: NegotiationPrivateStateId,
    initialPrivateState: privateState,
    args: [input.dealId, input.buyerKey, input.sellerKey, input.buyerCommitment],
  });

export const attachNegotiation = (
  providers: NegotiationProviders,
  contractAddress: string,
  privateState: NegotiationPrivateState,
): Promise<DeployedNegotiationContract> => {
  assertIsContractAddress(contractAddress);
  return findDeployedContract(providers, {
    contractAddress,
    compiledContract,
    privateStateId: NegotiationPrivateStateId,
    initialPrivateState: privateState,
  });
};

const callCircuit = async (
  contract: DeployedNegotiationContract,
  circuit:
    | "joinDeal"
    | "authorizeHiddenPrice"
    | "settle"
    | "cancelAsBuyer"
    | "cancelAsSeller",
): Promise<FinalizedTxData> => {
  const result = await contract.callTx[circuit]();
  return result.public;
};

export const joinDeal = (contract: DeployedNegotiationContract) =>
  callCircuit(contract, "joinDeal");
export const authorizeHiddenPrice = (contract: DeployedNegotiationContract) =>
  callCircuit(contract, "authorizeHiddenPrice");
export const settle = (contract: DeployedNegotiationContract) =>
  callCircuit(contract, "settle");
export const cancelAsBuyer = (contract: DeployedNegotiationContract) =>
  callCircuit(contract, "cancelAsBuyer");
export const cancelAsSeller = (contract: DeployedNegotiationContract) =>
  callCircuit(contract, "cancelAsSeller");

export const setSellerPriceOpening = async (
  providers: NegotiationProviders,
  contractAddress: string,
  opening: SellerPriceOpening,
): Promise<void> => {
  assertIsContractAddress(contractAddress);
  providers.privateStateProvider.setContractAddress(contractAddress);
  const current = await providers.privateStateProvider.get(
    NegotiationPrivateStateId,
  );
  if (current === null || current.role !== "seller") {
    throw new Error("seller private state is unavailable");
  }
  await providers.privateStateProvider.set(
    NegotiationPrivateStateId,
    withSellerPriceOpening(current, opening),
  );
};

export const queryPublicState = async (
  config: Pick<MidnightLocalConfig, "indexer" | "indexerWS">,
  contractAddress: string,
): Promise<Negotiation.Ledger> => {
  assertIsContractAddress(contractAddress);
  const state = await indexerPublicDataProvider(
    config.indexer,
    config.indexerWS,
  ).queryContractState(contractAddress);
  if (state === null) throw new Error("contract is not indexed");
  return Negotiation.ledger(state.data);
};

export const readDealState =
  (config: Pick<MidnightLocalConfig, "indexer" | "indexerWS">) =>
  async (contractAddress: string): Promise<PublicDealState> => {
    const ledgerState = await queryPublicState(config, contractAddress);
    return {
      dealId: ledgerState.dealId,
      priceCommitment: ledgerState.priceCommitment,
      status: Number(ledgerState.status),
    };
  };

// Reopens a session's private state from its record, for finishing or
// recovering that session after the live providers are gone.
export const openSessionStore = (
  record: SessionRecord,
  password: string,
): SessionStore => {
  if (record.contractAddress === undefined) {
    throw new Error("session has no contract to open");
  }
  const contractAddress = record.contractAddress;
  const provider = openPrivateStateProvider(record, password);
  provider.setContractAddress(contractAddress);
  return {
    async readOpening() {
      const state = await provider.get(NegotiationPrivateStateId);
      if (state === null) return undefined;
      if (state.role === "buyer") {
        return state.agreedPrice > 0n
          ? { price: state.agreedPrice, priceRandomness: state.priceRandomness }
          : undefined;
      }
      return state.priceOpening === undefined
        ? undefined
        : {
            price: state.priceOpening.agreedPrice,
            priceRandomness: state.priceOpening.priceRandomness,
          };
    },
    async erase() {
      await provider.remove(NegotiationPrivateStateId);
      await provider.removeSigningKey(contractAddress);
    },
  };
};

export type RoleStorage = {
  role: RuntimeRole;
  dataDir: string;
  keyStore: KeyStore;
  evidenceKey: Buffer;
  privateStatePassword: string;
};

// Loads the role's keys from the selected key store. An unavailable key store
// stops the runtime instead of falling back to a weaker one.
export const prepareRoleStorage = async (role: RuntimeRole): Promise<RoleStorage> => {
  const dataDir = resolveDataDir();
  const keyStore = selectKeyStore({ dataDir });
  return {
    role,
    dataDir,
    keyStore,
    evidenceKey: await keyStore.getOrCreateKey(role, "evidence"),
    privateStatePassword: privateStatePassword(
      await keyStore.getOrCreateKey(role, "private-state"),
    ),
  };
};

export const saveSessionRecord = (storage: RoleStorage, record: SessionRecord) =>
  writeSessionRecord(storage.dataDir, record);

const finalizeInput = (
  storage: RoleStorage,
  config: Pick<MidnightLocalConfig, "indexer" | "indexerWS">,
) => ({
  dataDir: storage.dataDir,
  network: LOCAL_NETWORK_ID,
  readDealState: readDealState(config),
  openStore: (record: SessionRecord) =>
    openSessionStore(record, storage.privateStatePassword),
  evidenceKey: storage.evidenceKey,
  keyStore: storage.keyStore.mode,
});

export const finalizeRoleSession = (
  storage: RoleStorage,
  config: Pick<MidnightLocalConfig, "indexer" | "indexerWS">,
  record: SessionRecord,
): Promise<FinalizeOutcome> =>
  finalizeSession({ ...finalizeInput(storage, config), record });

export const recoverRoleSessions = (
  storage: RoleStorage,
  config: Pick<MidnightLocalConfig, "indexer" | "indexerWS">,
) => recoverSessions({ ...finalizeInput(storage, config), role: storage.role });
