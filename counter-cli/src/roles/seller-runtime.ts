import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { hexToBytes, type SellerPrivateState } from '@midnight-ntwrk/counter-contract';
import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import { toHex } from '@midnight-ntwrk/midnight-js/utils';
import * as api from '../api';
import { type Config, currentDir, privateStateStoreNameFor } from '../config';
import { assertDealBinding } from '../isolation/deal-binding';
import { loadOrCreateRoleSeed } from '../isolation/role-wallet';
import { createLogger } from '../logger-utils';
import { publicError, sendToParent, waitForParent } from './runtime-utils';

const bytes32 = (): Uint8Array => new Uint8Array(randomBytes(32));

const config = JSON.parse(process.env.ROLE_CONFIG ?? '') as Config;
const walletDirectory = process.env.ROLE_WALLET_DIRECTORY;
if (walletDirectory === undefined) {
  throw new Error('seller wallet directory is required');
}
setNetworkId('undeployed');

const logger = await createLogger(
  path.resolve(currentDir, '..', 'logs', 'roles', `${new Date().toISOString()}-seller.log`),
);
api.setLogger(logger);

const run = async (): Promise<void> => {
  const seed = await loadOrCreateRoleSeed(walletDirectory);
  const walletAddress = api.getUnshieldedAddressForSeed(seed);
  sendToParent({ type: 'WALLET_ADDRESS', role: 'seller', walletAddress });
  await waitForParent((message): message is { type: 'FUNDED' } => message.type === 'FUNDED');

  const walletContext = await api.buildWalletAndWaitForFunds(config, seed);
  try {
    const providers = await api.configureProviders(walletContext, config, 'seller');
    const sellerState: SellerPrivateState = {
      role: 'seller',
      sellerSecretKey: bytes32(),
      sellerMinPrice: 95n,
      sellerLimitRandomness: bytes32(),
    };
    sendToParent({
      type: 'ROLE_READY',
      metadata: {
        role: 'seller',
        pid: process.pid,
        walletAddress,
        privateStateStore: privateStateStoreNameFor('seller'),
        proofServer: config.proofServer,
        localFields: Object.keys(sellerState).sort(),
        absentFields: ['buyerLimitRandomness', 'buyerMaxPrice', 'buyerSecretKey'],
        nightReady: true,
        dustReady: true,
      },
    });
    await waitForParent((message): message is { type: 'START' } => message.type === 'START');
    const contractReady = await waitForParent(
      (
        message,
      ): message is {
        type: 'RELAY';
        message: { type: 'CONTRACT_READY'; contractAddress: string };
      } => message.type === 'RELAY' && message.message.type === 'CONTRACT_READY',
    );
    const contractAddress = contractReady.message.contractAddress;
    const contract = await api.joinContract(providers, contractAddress, sellerState);
    await api.joinDeal(contract);
    const joined = await api.getNegotiationLedgerState(providers, contract);
    const publicDealId = toHex(joined.dealId);
    sendToParent({ type: 'CHAIN_STATE', status: Number(joined.status), finalPrice: joined.finalPrice.toString() });
    sendToParent({ type: 'SELLER_JOINED' });

    const proposal = await waitForParent(
      (
        message,
      ): message is {
        type: 'RELAY';
        message: { type: 'PROPOSAL'; dealId: string; price: string };
      } => message.type === 'RELAY' && message.message.type === 'PROPOSAL',
    );
    assertDealBinding(publicDealId, proposal.message);
    if (BigInt(proposal.message.price) < sellerState.sellerMinPrice) {
      throw new Error('proposal does not satisfy seller policy');
    }

    const opening = await waitForParent(
      (
        message,
      ): message is {
        type: 'RELAY';
        message: { type: 'PRICE_OPENING'; dealId: string; price: string; priceRandomness: string };
      } => message.type === 'RELAY' && message.message.type === 'PRICE_OPENING',
    );
    assertDealBinding(publicDealId, proposal.message, opening.message);
    await api.storeSellerPriceOpening(providers, contractAddress, {
      agreedPrice: BigInt(opening.message.price),
      priceRandomness: hexToBytes(opening.message.priceRandomness),
    });
    await api.settle(contract);
    const settled = await api.getNegotiationLedgerState(providers, contract);
    sendToParent({ type: 'CHAIN_STATE', status: Number(settled.status), finalPrice: settled.finalPrice.toString() });
    sendToParent({ type: 'SETTLED' });
  } finally {
    await walletContext.wallet.stop();
  }
};

void run().catch((error: unknown) => {
  sendToParent({ type: 'ERROR', role: 'seller', code: publicError(error) });
  process.exitCode = 1;
});
