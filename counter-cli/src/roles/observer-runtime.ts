import { Negotiation } from '@midnight-ntwrk/counter-contract';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import { assertIsContractAddress } from '@midnight-ntwrk/midnight-js/utils';
import { parseParentToObserverMessage, type ObserverEvent, type ObserverInput } from '../isolation/child-protocol';

const sendToParent = (message: ObserverEvent): void => {
  if (process.send === undefined) {
    throw new Error('observer runtime requires an IPC parent');
  }
  process.send(message);
};

const parseInput = (value: string | undefined): ObserverInput => {
  const input = JSON.parse(value ?? '') as ObserverInput;
  const keys = Object.keys(input).sort();
  const expectedKeys = ['contractAddress', 'indexer', 'indexerWS'];
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error('observer input contains unexpected fields');
  }
  assertIsContractAddress(input.contractAddress);
  return input;
};

const prefix = (value: Uint8Array): string => Buffer.from(value).toString('hex').slice(0, 12);

setNetworkId('undeployed');
const input = parseInput(process.env.OBSERVER_INPUT);
const publicDataProvider = indexerPublicDataProvider(input.indexer, input.indexerWS);
const forbiddenEnvironmentKeys = [
  'ROLE_CONFIG',
  'ROLE_WALLET_DIRECTORY',
  'FUNDER_INPUT',
  'TEST_WALLET_SEED',
  'WALLET_SEED',
  'PRIVATE_STATE',
  'PROOF_SERVER',
].filter((key) => process.env[key] !== undefined);

sendToParent({
  type: 'OBSERVER_READY',
  metadata: {
    pid: process.pid,
    configKeys: Object.keys(input).sort(),
    absentFields: ['walletSeed', 'walletDirectory', 'privateState', 'privateStateStore', 'proofServer'],
    forbiddenEnvironmentKeys,
  },
});

let observationQueue = Promise.resolve();

process.on('message', (raw: unknown) => {
  const message = parseParentToObserverMessage(raw);
  observationQueue = observationQueue
    .then(async () => {
      const contractState = await publicDataProvider.queryContractState(input.contractAddress);
      if (contractState === null) {
        throw new Error('observer could not find public contract state');
      }
      const state = Negotiation.ledger(contractState.data);
      if (Number(state.status) !== message.expectedStatus) {
        throw new Error('observer state did not match expected public status');
      }
      sendToParent({
        type: 'OBSERVER_STATE',
        state: {
          status: Number(state.status),
          finalPrice: state.finalPrice.toString(),
          buyerCommitmentPrefix: prefix(state.buyerCommitment),
          sellerCommitmentPrefix: prefix(state.sellerCommitment),
          priceCommitmentPrefix: prefix(state.priceCommitment),
        },
      });
    })
    .catch((error: unknown) => {
      void error;
      sendToParent({ type: 'ERROR', role: 'observer', code: 'RUNTIME_FAILED' });
      process.exitCode = 1;
    });
});
