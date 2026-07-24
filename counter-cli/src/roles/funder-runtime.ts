import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import * as api from '../api';
import type { FunderEvent, FunderInput } from '../isolation/child-protocol';
import { fundWallet } from '../isolation/wallet-bootstrap';

const GENESIS_MINT_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000001';
const input = JSON.parse(process.env.FUNDER_INPUT ?? '') as FunderInput;
setNetworkId('undeployed');

const send = (event: FunderEvent): void => {
  if (process.send === undefined) {
    throw new Error('funder runtime requires an IPC parent');
  }
  process.send(event);
};

const run = async (): Promise<void> => {
  const walletContext = await api.buildWalletAndWaitForFunds(input.config, GENESIS_MINT_WALLET_SEED);
  try {
    for (const receiverAddress of input.recipients) {
      await fundWallet(walletContext, receiverAddress, BigInt(input.amount));
    }
    send({ type: 'FUNDER_DONE' });
  } finally {
    await walletContext.wallet.stop();
  }
};

void run().catch((error: unknown) => {
  void error;
  send({
    type: 'ERROR',
    role: 'funder',
    code: 'RUNTIME_FAILED',
  });
  process.exitCode = 1;
});
