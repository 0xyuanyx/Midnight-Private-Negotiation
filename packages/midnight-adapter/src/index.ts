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
import { fileURLToPath } from "node:url";
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

export const useUndeployedNetwork = (): void => setNetworkId("undeployed");

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

const registerNightForDust = async (context: WalletContext): Promise<void> => {
  const state = await waitForWalletSync(context.wallet);
  if (state.dust.balance(new Date()) > 0n) return;
  const coins = state.unshielded.availableCoins.filter(
    (coin) => coin.meta?.registeredForDustGeneration !== true,
  );
  if (coins.length > 0) {
    const recipe = await context.wallet.registerNightUtxosForDustGeneration(
      coins,
      context.unshieldedKeystore.getPublicKey(),
      (payload) => context.unshieldedKeystore.signData(payload),
    );
    await context.wallet.submitTransaction(
      await context.wallet.finalizeRecipe(recipe),
    );
  }
  await Rx.firstValueFrom(
    context.wallet.state().pipe(
      Rx.filter((next) => next.isSynced && next.dust.balance(new Date()) > 0n),
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

export const configureProviders = async (
  context: WalletContext,
  config: MidnightLocalConfig,
  role: RuntimeRole,
  sessionId: string,
): Promise<NegotiationProviders> => {
  const walletProvider = await createWalletProvider(context);
  const zkConfigProvider =
    new NodeZkConfigProvider<NegotiationCircuits>(zkConfigPath);
  const accountId = walletProvider.getCoinPublicKey();
  const storagePassword = `${Buffer.from(accountId, "hex").toString("base64")}!`;
  return {
    privateStateProvider: levelPrivateStateProvider<
      typeof NegotiationPrivateStateId
    >({
      privateStateStoreName: `negotiation-${role}-${sessionId}-${accountId.slice(0, 16)}`,
      accountId,
      privateStoragePasswordProvider: () => storagePassword,
    }),
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
    buyerCommitment: Uint8Array;
  },
): Promise<DeployedNegotiationContract> =>
  deployContract(providers, {
    compiledContract,
    privateStateId: NegotiationPrivateStateId,
    initialPrivateState: privateState,
    args: [input.dealId, input.buyerKey, input.buyerCommitment],
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
