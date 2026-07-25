import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type { Config } from '../config';
import { currentDir } from '../config';
import type {
  FunderInput,
  IsolatedRunResult,
  ObserverMetadata,
  ObserverState,
  RoleToParentMessage,
  RuntimeMetadata,
} from './child-protocol';
import { parseFunderEvent, parseObserverEvent, parseRoleToParentMessage } from './child-protocol';
import { type IsolationMessage, relayAudit } from './protocol';
import { RoleProtocolSequence } from './sequence';

export type IsolatedRunOptions = {
  buyerConfig: Config;
  sellerConfig: Config;
  walletRoot: string;
};

const childExecArgv = ['--no-warnings', '--experimental-specifier-resolution=node', '--loader', 'ts-node/esm'];

const publicProcessEnvironment = (): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL']) {
    const value = process.env[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
};

const spawnRole = (role: 'buyer' | 'seller', config: Config, walletRoot: string): ChildProcess =>
  fork(path.resolve(currentDir, 'roles', `${role}-runtime.ts`), {
    execArgv: childExecArgv,
    env: {
      ...publicProcessEnvironment(),
      ROLE_CONFIG: JSON.stringify(config),
      ROLE_WALLET_DIRECTORY: path.join(walletRoot, role),
    },
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });

const send = (child: ChildProcess, message: object): void => {
  if (!child.connected) {
    throw new Error('role process disconnected before protocol completion');
  }
  child.send(message);
};

export const runIsolatedNegotiation = async (options: IsolatedRunOptions): Promise<IsolatedRunResult> =>
  await new Promise<IsolatedRunResult>((resolve, reject) => {
    const buyer = spawnRole('buyer', options.buyerConfig, options.walletRoot);
    const seller = spawnRole('seller', options.sellerConfig, options.walletRoot);
    const liveChildren = new Set<ChildProcess>([buyer, seller]);
    const addresses = new Map<'buyer' | 'seller', string>();
    const metadata = new Map<'buyer' | 'seller', RuntimeMetadata>();
    const audits: IsolatedRunResult['relayAudit'] = [];
    const statuses: number[] = [];
    const observerStates: ObserverState[] = [];
    const sequence = new RoleProtocolSequence();
    let finalPrice = 0n;
    let funder: ChildProcess | undefined;
    let observer: ChildProcess | undefined;
    let observerMetadata: ObserverMetadata | undefined;
    let settlementReported = false;
    let rolesStarted = false;
    let funderCompleted = false;
    let sellerJoinedPending = false;
    let priceOpeningPending: IsolationMessage | undefined;
    const relayToSellerPending: IsolationMessage[] = [];
    let completed = false;

    const cleanup = (): void => {
      globalThis.clearTimeout(timeout);
      for (const child of liveChildren) {
        if (child.connected) {
          child.disconnect();
        }
        if (child.exitCode === null) {
          child.kill();
        }
      }
    };
    const fail = (error: unknown): void => {
      if (completed) return;
      completed = true;
      cleanup();
      reject(error instanceof Error ? error : new Error('isolated negotiation failed'));
    };
    const finish = (): void => {
      if (completed) return;
      const buyerMetadata = metadata.get('buyer');
      const sellerMetadata = metadata.get('seller');
      if (
        buyerMetadata === undefined ||
        sellerMetadata === undefined ||
        observerMetadata === undefined ||
        observerStates.at(-1)?.status !== 3
      ) {
        fail(new Error('runtime metadata or observer settlement state missing'));
        return;
      }
      completed = true;
      cleanup();
      resolve({
        buyer: buyerMetadata,
        seller: sellerMetadata,
        observer: observerMetadata,
        observerStates,
        relayAudit: audits,
        statuses,
        finalPrice,
      });
    };
    const timeout = setTimeout(() => fail(new Error('isolated negotiation timed out')), 12 * 60 * 1000);

    const maybeFinish = (): void => {
      if (settlementReported && observerStates.at(-1)?.status === 3 && sequence.isComplete()) {
        finish();
      }
    };

    const startRolesIfReady = (): void => {
      if (rolesStarted || !sequence.rolesReady()) return;
      const buyerMetadata = metadata.get('buyer');
      const sellerMetadata = metadata.get('seller');
      if (buyerMetadata === undefined || sellerMetadata === undefined || addresses.size !== 2) {
        throw new Error('role readiness metadata is incomplete');
      }
      if (
        buyerMetadata.pid === sellerMetadata.pid ||
        addresses.get('buyer') !== buyerMetadata.walletAddress ||
        addresses.get('seller') !== sellerMetadata.walletAddress ||
        addresses.get('buyer') === addresses.get('seller') ||
        buyerMetadata.walletAddress === sellerMetadata.walletAddress ||
        buyerMetadata.privateStateStore === sellerMetadata.privateStateStore ||
        buyerMetadata.proofServer === sellerMetadata.proofServer ||
        !buyerMetadata.nightReady ||
        !buyerMetadata.dustReady ||
        !sellerMetadata.nightReady ||
        !sellerMetadata.dustReady
      ) {
        throw new Error('pre-deployment isolation gate failed');
      }
      rolesStarted = true;
      send(buyer, { type: 'START' });
      send(seller, { type: 'START' });
    };

    const startObserver = (contractAddress: string): void => {
      if (observer !== undefined) return;
      observer = fork(path.resolve(currentDir, 'roles', 'observer-runtime.ts'), {
        execArgv: childExecArgv,
        env: {
          ...publicProcessEnvironment(),
          OBSERVER_INPUT: JSON.stringify({
            contractAddress,
            indexer: options.buyerConfig.indexer,
            indexerWS: options.buyerConfig.indexerWS,
          }),
        },
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      });
      liveChildren.add(observer);
      observer.on('message', (raw: unknown) => {
        try {
          const value = parseObserverEvent(raw);
          if (value.type === 'ERROR') {
            fail(new Error('observer runtime failed'));
            return;
          }
          if (value.type === 'OBSERVER_READY') {
            if (observerMetadata !== undefined || value.metadata.pid !== observer?.pid) {
              throw new Error('observer readiness identity or phase is invalid');
            }
            observerMetadata = value.metadata;
            send(observer!, { type: 'OBSERVE', expectedStatus: 0 });
            return;
          }

          if (value.state.status !== observerStates.length) {
            throw new Error('observer state sequence is invalid');
          }
          observerStates.push(value.state);
          switch (value.state.status) {
            case 0:
              for (const message of relayToSellerPending.splice(0)) {
                send(seller, { type: 'RELAY', message });
              }
              break;
            case 1:
              if (sellerJoinedPending) {
                sellerJoinedPending = false;
                send(buyer, { type: 'SELLER_JOINED' });
              }
              break;
            case 2:
              if (priceOpeningPending !== undefined) {
                const message = priceOpeningPending;
                priceOpeningPending = undefined;
                send(seller, { type: 'RELAY', message });
              }
              break;
            case 3:
              maybeFinish();
              break;
          }
        } catch (error) {
          fail(error);
        }
      });
      observer.on('exit', (code) => {
        if (code !== 0 && !completed) fail(new Error(`observer exited with code ${String(code)}`));
      });
    };

    const startFunderIfReady = (): void => {
      if (funder !== undefined || addresses.size !== 2) return;
      const input: FunderInput = {
        config: options.buyerConfig,
        recipients: [addresses.get('buyer')!, addresses.get('seller')!],
        amount: '10000000000000',
      };
      funder = fork(path.resolve(currentDir, 'roles', 'funder-runtime.ts'), {
        execArgv: childExecArgv,
        env: { ...publicProcessEnvironment(), FUNDER_INPUT: JSON.stringify(input) },
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      });
      liveChildren.add(funder);
      funder.on('message', (raw: unknown) => {
        try {
          const value = parseFunderEvent(raw);
          if (value.type === 'ERROR') {
            fail(new Error('funder runtime failed'));
            return;
          }
          if (funderCompleted) throw new Error('duplicate funder completion event');
          funderCompleted = true;
          send(buyer, { type: 'FUNDED' });
          send(seller, { type: 'FUNDED' });
        } catch (error) {
          fail(error);
        }
      });
      funder.on('exit', (code) => {
        if (code !== 0 && !completed) fail(new Error(`funder exited with code ${String(code)}`));
      });
    };

    const handleRoleMessage = (source: 'buyer' | 'seller', value: RoleToParentMessage): void => {
      try {
        switch (value.type) {
          case 'WALLET_ADDRESS':
            sequence.acceptWallet(source);
            addresses.set(source, value.walletAddress);
            startFunderIfReady();
            break;
          case 'ROLE_READY':
            sequence.acceptReady(source);
            metadata.set(source, value.metadata);
            startRolesIfReady();
            break;
          case 'RELAY': {
            const message = value.message;
            sequence.acceptRelay(source, message);
            audits.push(relayAudit(message));
            if (message.type === 'CONTRACT_READY') {
              relayToSellerPending.push(message);
              startObserver(message.contractAddress);
            } else if (message.type === 'PROPOSAL') {
              if (observerStates.some(({ status }) => status === 0)) {
                send(seller, { type: 'RELAY', message });
              } else {
                relayToSellerPending.push(message);
              }
            } else if (observerStates.some(({ status }) => status === 2)) {
              send(seller, { type: 'RELAY', message });
            } else {
              priceOpeningPending = message;
            }
            break;
          }
          case 'CHAIN_STATE':
            sequence.acceptChainState(source, value.status);
            statuses.push(value.status);
            finalPrice = BigInt(value.finalPrice);
            if (value.status > 0) {
              if (observer === undefined) {
                throw new Error('observer missing before public state transition');
              }
              send(observer, { type: 'OBSERVE', expectedStatus: value.status });
            }
            break;
          case 'SELLER_JOINED':
            sequence.acceptSignal(source, 'SELLER_JOINED');
            if (observerStates.some(({ status }) => status === 1)) {
              send(buyer, { type: 'SELLER_JOINED' });
            } else {
              sellerJoinedPending = true;
            }
            break;
          case 'SETTLED':
            sequence.acceptSignal(source, 'SETTLED');
            settlementReported = true;
            maybeFinish();
            break;
          case 'ERROR':
            fail(new Error(`${value.role} runtime failed`));
            break;
        }
      } catch (error) {
        fail(error);
      }
    };

    const parseRoleEvent = (source: 'buyer' | 'seller', raw: unknown): RoleToParentMessage => {
      const child = source === 'buyer' ? buyer : seller;
      if (child.pid === undefined) throw new Error('role process id is unavailable');
      const config = source === 'buyer' ? options.buyerConfig : options.sellerConfig;
      const walletAddress = addresses.get(source);
      if (walletAddress === undefined && (raw as { type?: unknown })?.type === 'ROLE_READY') {
        throw new Error('role readiness arrived before wallet address');
      }
      return parseRoleToParentMessage(source, raw, {
        pid: child.pid,
        ...(walletAddress === undefined ? {} : { walletAddress }),
        privateStateStore: `negotiation-${source}-private-state`,
        proofServer: config.proofServer,
      });
    };

    buyer.on('message', (raw: unknown) => {
      try {
        handleRoleMessage('buyer', parseRoleEvent('buyer', raw));
      } catch (error) {
        fail(error);
      }
    });
    seller.on('message', (raw: unknown) => {
      try {
        handleRoleMessage('seller', parseRoleEvent('seller', raw));
      } catch (error) {
        fail(error);
      }
    });
    buyer.on('exit', (code) => {
      if (code !== 0 && !completed) fail(new Error(`buyer exited with code ${String(code)}`));
    });
    seller.on('exit', (code) => {
      if (code !== 0 && !completed) fail(new Error(`seller exited with code ${String(code)}`));
    });
  });
