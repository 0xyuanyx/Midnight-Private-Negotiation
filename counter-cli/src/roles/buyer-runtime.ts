import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { limitCommitment, publicKeyForSecret, type BuyerPrivateState } from '@midnight-ntwrk/counter-contract';
import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import * as api from '../api';
import { NegotiationPrivateStateId } from '../common-types';
import { type Config, currentDir, privateStateStoreNameFor } from '../config';
import { loadOrCreateRoleSeed } from '../isolation/role-wallet';
import { createLogger } from '../logger-utils';
import { publicError, sendToParent, waitForParent } from './runtime-utils';

const bytes32 = (): Uint8Array => new Uint8Array(randomBytes(32));
const toHex = (value: Uint8Array): string => Buffer.from(value).toString('hex');

const config = JSON.parse(process.env.ROLE_CONFIG ?? '') as Config;
const walletDirectory = process.env.ROLE_WALLET_DIRECTORY;
if (walletDirectory === undefined) {
  throw new Error('buyer wallet directory is required');
}
setNetworkId('undeployed');

const logger = await createLogger(
  path.resolve(currentDir, '..', 'logs', 'roles', `${new Date().toISOString()}-buyer.log`),
);
api.setLogger(logger);

const run = async (): Promise<void> => {
  const seed = await loadOrCreateRoleSeed(walletDirectory);
  const walletAddress = api.getUnshieldedAddressForSeed(seed);
  sendToParent({ type: 'WALLET_ADDRESS', role: 'buyer', walletAddress });
  await waitForParent((message): message is { type: 'FUNDED' } => message.type === 'FUNDED');

  const walletContext = await api.buildWalletAndWaitForFunds(config, seed);
  try {
    const providers = await api.configureProviders(walletContext, config, 'buyer');
    const dealId = bytes32();
    const buyerSecretKey = bytes32();
    const buyerKey = publicKeyForSecret(buyerSecretKey);
    const buyerLimitRandomness = bytes32();
    const priceRandomness = bytes32();
    const buyerState: BuyerPrivateState = {
      role: 'buyer',
      buyerSecretKey,
      buyerMaxPrice: 110n,
      buyerLimitRandomness,
      agreedPrice: 100n,
      priceRandomness,
    };
    sendToParent({
      type: 'ROLE_READY',
      metadata: {
        role: 'buyer',
        pid: process.pid,
        walletAddress,
        privateStateStore: privateStateStoreNameFor('buyer'),
        proofServer: config.proofServer,
        localFields: Object.keys(buyerState).sort(),
        absentFields: ['sellerLimitRandomness', 'sellerMinPrice', 'sellerSecretKey'],
        nightReady: true,
        dustReady: true,
      },
    });
    await waitForParent((message): message is { type: 'START' } => message.type === 'START');
    const contract = await api.deploy(providers, buyerState, {
      dealId,
      buyerKey,
      buyerCommitment: limitCommitment(
        dealId,
        'negotiation:buyer:',
        buyerKey,
        buyerState.buyerMaxPrice,
        buyerLimitRandomness,
      ),
    });
    const contractAddress = contract.deployTxData.public.contractAddress;
    const deployed = await api.getNegotiationLedgerState(providers, contract);
    sendToParent({ type: 'CHAIN_STATE', status: Number(deployed.status), finalPrice: deployed.finalPrice.toString() });
    sendToParent({ type: 'RELAY', message: { type: 'CONTRACT_READY', contractAddress } });
    sendToParent({ type: 'RELAY', message: { type: 'PROPOSAL', dealId: toHex(dealId), price: '100' } });

    await waitForParent((message): message is { type: 'SELLER_JOINED' } => message.type === 'SELLER_JOINED');
    providers.privateStateProvider.setContractAddress(contractAddress);
    await providers.privateStateProvider.set(NegotiationPrivateStateId, buyerState);
    await api.authorizeHiddenPrice(contract);
    const authorized = await api.getNegotiationLedgerState(providers, contract);
    sendToParent({
      type: 'CHAIN_STATE',
      status: Number(authorized.status),
      finalPrice: authorized.finalPrice.toString(),
    });
    sendToParent({
      type: 'RELAY',
      message: {
        type: 'PRICE_OPENING',
        dealId: toHex(dealId),
        price: buyerState.agreedPrice.toString(),
        priceRandomness: toHex(priceRandomness),
      },
    });
  } finally {
    await walletContext.wallet.stop();
  }
};

void run().catch((error: unknown) => {
  sendToParent({ type: 'ERROR', role: 'buyer', code: publicError(error) });
  process.exitCode = 1;
});
