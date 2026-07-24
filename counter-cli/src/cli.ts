// This file is part of midnightntwrk/example-counter.
// Copyright (C) Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { type WalletContext } from './api';
import {
  limitCommitment,
  publicKeyForSecret,
  withSellerPriceOpening,
  type BuyerPrivateState,
  type SellerPrivateState,
} from '@midnight-ntwrk/counter-contract';
import { randomBytes } from 'node:crypto';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface, type Interface } from 'node:readline/promises';
import { type Logger } from 'pino';
import { type StartedDockerComposeEnvironment, type DockerComposeEnvironment } from 'testcontainers';
import { type DeployedNegotiationContract, NegotiationPrivateStateId, type NegotiationProviders } from './common-types';
import { type Config, StandaloneConfig } from './config';
import * as api from './api';

let logger: Logger;

/**
 * This seed gives access to tokens minted in the genesis block of a local development node.
 * Only used in standalone networks to build a wallet with initial funds.
 */
const GENESIS_MINT_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

// ─── Display Helpers ────────────────────────────────────────────────────────

const BANNER = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║              Midnight Negotiation Demo                       ║
║              ─────────────────────────                       ║
║              Staged private-price contract integration       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;

const DIVIDER = '──────────────────────────────────────────────────────────────';

// ─── Menu Helpers ──────────────────────────────────────────────────────────

const WALLET_MENU = `
${DIVIDER}
  Wallet Setup
${DIVIDER}
  [1] Create a new wallet
  [2] Restore wallet from seed
  [3] Exit
${'─'.repeat(62)}
> `;

/** Build the contract actions menu, showing current DUST balance in the header. */
const contractMenu = (dustBalance: string) => `
${DIVIDER}
  Contract Actions${dustBalance ? `                    DUST: ${dustBalance}` : ''}
${DIVIDER}
  [1] Deploy a staged negotiation demo
  [2] Monitor DUST balance
  [3] Exit
${'─'.repeat(62)}
> `;

/** Build the negotiation actions menu, showing current DUST balance in the header. */
const negotiationMenu = (dustBalance: string) => `
${DIVIDER}
  Negotiation Actions${dustBalance ? `                 DUST: ${dustBalance}` : ''}
${DIVIDER}
  [1] Seller joins deal
  [2] Buyer authorizes hidden price
  [3] Seller settles and discloses price
  [4] Display public ledger state
  [5] Cancel as buyer
  [6] Cancel as seller
  [7] Exit
${'─'.repeat(62)}
> `;

// ─── Wallet Setup ───────────────────────────────────────────────────────────

/** Prompt the user for a seed phrase and restore a wallet from it. */
const buildWalletFromSeed = async (config: Config, rli: Interface): Promise<WalletContext> => {
  const seed = await rli.question('Enter your wallet seed: ');
  return await api.buildWalletAndWaitForFunds(config, seed);
};

/**
 * Wallet creation flow.
 * - Standalone configs skip the menu and use the genesis seed automatically.
 * - All other configs present a menu to create or restore a wallet.
 */
const buildWallet = async (config: Config, rli: Interface): Promise<WalletContext | null> => {
  // Standalone mode: use the pre-funded genesis wallet
  if (config instanceof StandaloneConfig) {
    return await api.buildWalletAndWaitForFunds(config, GENESIS_MINT_WALLET_SEED);
  }

  while (true) {
    const choice = await rli.question(WALLET_MENU);
    switch (choice.trim()) {
      case '1':
        return await api.buildFreshWallet(config);
      case '2':
        return await buildWalletFromSeed(config, rli);
      case '3':
        return null;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

// ─── Contract Interaction ───────────────────────────────────────────────────

/** Format dust balance for menu headers. */
const getDustLabel = async (wallet: api.WalletContext['wallet']): Promise<string> => {
  try {
    const dust = await api.getDustBalance(wallet);
    return dust.available.toLocaleString();
  } catch {
    return '';
  }
};

const randomBytes32 = (): Uint8Array => new Uint8Array(randomBytes(32));

const createDemoDeployment = () => {
  const dealId = randomBytes32();
  const buyerSecretKey = randomBytes32();
  const buyerKey = publicKeyForSecret(buyerSecretKey);
  const buyerLimitRandomness = randomBytes32();
  const buyerPrivateState: BuyerPrivateState = {
    role: 'buyer',
    buyerSecretKey,
    buyerMaxPrice: 110n,
    buyerLimitRandomness,
    agreedPrice: 100n,
    priceRandomness: randomBytes32(),
  };
  const sellerPrivateState: SellerPrivateState = {
    role: 'seller',
    sellerSecretKey: randomBytes32(),
    sellerMinPrice: 95n,
    sellerLimitRandomness: randomBytes32(),
  };

  return {
    buyerPrivateState,
    sellerPrivateState,
    deployment: {
      dealId,
      buyerKey,
      buyerCommitment: limitCommitment(
        dealId,
        'negotiation:buyer:',
        buyerKey,
        buyerPrivateState.buyerMaxPrice,
        buyerLimitRandomness,
      ),
    },
  };
};

/**
 * Start the DUST monitor. Shows a live-updating balance display
 * that runs until the user presses Enter.
 */
const startDustMonitor = async (wallet: api.WalletContext['wallet'], rli: Interface): Promise<void> => {
  console.log('');
  // Use readline question to wait for Enter — the monitor will render above this line
  const stopPromise = rli.question('  Press Enter to return to menu...\n').then(() => {});
  await api.monitorDustBalance(wallet, stopPromise);
  console.log('');
};

/**
 * Deploy flow. The first integration milestone intentionally keeps both parties'
 * private inputs in one local runtime so every real circuit can be exercised.
 */
const deployDemo = async (
  providers: NegotiationProviders,
  walletCtx: api.WalletContext,
  rli: Interface,
): Promise<{
  contract: DeployedNegotiationContract;
  buyerPrivateState: BuyerPrivateState;
  sellerPrivateState: SellerPrivateState;
} | null> => {
  while (true) {
    const dustLabel = await getDustLabel(walletCtx.wallet);
    const choice = await rli.question(contractMenu(dustLabel));
    switch (choice.trim()) {
      case '1':
        try {
          const { buyerPrivateState, sellerPrivateState, deployment } = createDemoDeployment();
          const contract = await api.withStatus('Deploying negotiation contract', () =>
            api.deploy(providers, buyerPrivateState, deployment),
          );
          console.log(`  Contract deployed at: ${contract.deployTxData.public.contractAddress}\n`);
          console.log('  Demo values: buyer max 110, seller min 95, agreed price 100');
          console.log('  Private keys and randomness remain in local private state.\n');
          return { contract, buyerPrivateState, sellerPrivateState };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`\n  ✗ Deploy failed: ${msg}`);
          // Log the full cause chain to help debug WASM/ledger errors
          if (e instanceof Error && e.cause) {
            let cause: unknown = e.cause;
            let depth = 0;
            while (cause && depth < 5) {
              const causeMsg =
                cause instanceof Error
                  ? `${cause.message}\n      ${cause.stack?.split('\n').slice(1, 3).join('\n      ') ?? ''}`
                  : String(cause);
              console.log(`    cause: ${causeMsg}`);
              cause = cause instanceof Error ? cause.cause : undefined;
              depth++;
            }
          }
          if (msg.toLowerCase().includes('dust') || msg.toLowerCase().includes('no dust')) {
            console.log('    Insufficient DUST for transaction fees. Use option [3] to monitor your balance.');
          }
          console.log('');
        }
        break;
      case '2':
        await startDustMonitor(walletCtx.wallet, rli);
        break;
      case '3':
        return null;
      default:
        console.log(`  Invalid choice: ${choice}`);
    }
  }
};

/**
 * Main interaction loop for the staged negotiation lifecycle.
 */
const mainLoop = async (
  providers: NegotiationProviders,
  walletCtx: api.WalletContext,
  rli: Interface,
): Promise<void> => {
  const session = await deployDemo(providers, walletCtx, rli);
  if (session === null) {
    return;
  }
  const { contract: negotiationContract, buyerPrivateState, sellerPrivateState } = session;
  const contractAddress = negotiationContract.deployTxData.public.contractAddress;
  const activatePrivateState = async (state: BuyerPrivateState | SellerPrivateState): Promise<void> => {
    providers.privateStateProvider.setContractAddress(contractAddress);
    await providers.privateStateProvider.set(NegotiationPrivateStateId, state);
  };

  while (true) {
    const dustLabel = await getDustLabel(walletCtx.wallet);
    const choice = await rli.question(negotiationMenu(dustLabel));
    switch (choice.trim()) {
      case '1':
        try {
          await activatePrivateState(sellerPrivateState);
          await api.withStatus('Seller joining deal', () => api.joinDeal(negotiationContract));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  ✗ Seller join failed: ${msg}\n`);
        }
        break;
      case '2':
        try {
          await activatePrivateState(buyerPrivateState);
          await api.withStatus('Authorizing hidden price', () => api.authorizeHiddenPrice(negotiationContract));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  ✗ Authorization failed: ${msg}\n`);
        }
        break;
      case '3':
        try {
          await activatePrivateState(
            withSellerPriceOpening(sellerPrivateState, {
              agreedPrice: buyerPrivateState.agreedPrice,
              priceRandomness: buyerPrivateState.priceRandomness,
            }),
          );
          await api.withStatus('Settling negotiation', () => api.settle(negotiationContract));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  ✗ Settlement failed: ${msg}\n`);
        }
        break;
      case '4': {
        const state = await api.getNegotiationLedgerState(providers, negotiationContract);
        console.log(`  Status: ${state.status}; final price: ${state.finalPrice}\n`);
        break;
      }
      case '5':
        try {
          await activatePrivateState(buyerPrivateState);
          await api.withStatus('Cancelling as buyer', () => api.cancelAsBuyer(negotiationContract));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  ✗ Buyer cancellation failed: ${msg}\n`);
        }
        break;
      case '6':
        try {
          await activatePrivateState(sellerPrivateState);
          await api.withStatus('Cancelling as seller', () => api.cancelAsSeller(negotiationContract));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  ✗ Seller cancellation failed: ${msg}\n`);
        }
        break;
      case '7':
        return;
      default:
        console.log(`  Invalid choice: ${choice}`);
    }
  }
};

// ─── Docker Port Mapping ────────────────────────────────────────────────────

/** Map a container's first exposed port into the config URL. */
const mapContainerPort = (env: StartedDockerComposeEnvironment, url: string, containerName: string) => {
  const mappedUrl = new URL(url);
  const container = env.getContainer(containerName);
  mappedUrl.port = String(container.getFirstMappedPort());
  return mappedUrl.toString().replace(/\/+$/, '');
};

// ─── Entry Point ────────────────────────────────────────────────────────────

/**
 * Main entry point for the CLI.
 *
 * Flow:
 *   1. (Optional) Start Docker containers for proof server / node / indexer
 *   2. Build or restore a wallet and wait for it to be funded
 *   3. Configure midnight-js providers (proof server, indexer, wallet, private state)
 *   4. Enter the staged negotiation interaction loop
 *   5. Clean up: close wallet, readline, and docker environment
 */
export const run = async (config: Config, _logger: Logger, dockerEnv?: DockerComposeEnvironment): Promise<void> => {
  logger = _logger;
  api.setLogger(_logger);

  // Print the title banner
  console.log(BANNER);

  const rli = createInterface({ input, output, terminal: true });
  let env: StartedDockerComposeEnvironment | undefined;

  try {
    // Step 1: Start Docker environment if provided (e.g. local proof server)
    if (dockerEnv !== undefined) {
      env = await dockerEnv.up();

      // In standalone mode, remap ports to the dynamically assigned container ports
      if (config instanceof StandaloneConfig) {
        config.indexer = mapContainerPort(env, config.indexer, 'counter-indexer');
        config.indexerWS = mapContainerPort(env, config.indexerWS, 'counter-indexer');
        config.node = mapContainerPort(env, config.node, 'counter-node');
        config.proofServer = mapContainerPort(env, config.proofServer, 'negotiation-buyer-proof-server');
      }
    }

    // Step 2: Build wallet (create new or restore from seed)
    const walletCtx = await buildWallet(config, rli);
    if (walletCtx === null) {
      return;
    }

    try {
      // Step 3: Configure midnight-js providers
      const providers = await api.withStatus('Configuring providers', () =>
        api.configureProviders(walletCtx, config, 'buyer'),
      );
      console.log('');

      // Step 4: Enter the contract interaction loop
      await mainLoop(providers, walletCtx, rli);
    } catch (e) {
      if (e instanceof Error) {
        logger.error(`Error: ${e.message}`);
        logger.debug(`${e.stack}`);
      } else {
        throw e;
      }
    } finally {
      // Step 5a: Stop the wallet
      try {
        await walletCtx.wallet.stop();
      } catch (e) {
        logger.error(`Error stopping wallet: ${e}`);
      }
    }
  } finally {
    // Step 5b: Close readline and Docker environment
    rli.close();
    rli.removeAllListeners();

    if (env !== undefined) {
      try {
        await env.down();
      } catch (e) {
        logger.error(`Error shutting down docker environment: ${e}`);
      }
    }

    logger.info('Goodbye.');
  }
};
