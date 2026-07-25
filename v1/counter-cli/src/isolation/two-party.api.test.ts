import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { currentDir } from '../config';
import { createLogger } from '../logger-utils';
import { TestEnvironment, type TestConfiguration } from '../test/commons';
import { runIsolatedNegotiation } from './orchestrator';

const logger = await createLogger(
  path.resolve(currentDir, '..', 'logs', 'tests', `${new Date().toISOString()}-isolated.log`),
);

describe('two-party runtime isolation', () => {
  let environment: TestEnvironment;
  let configuration: TestConfiguration;

  beforeAll(
    async () => {
      environment = new TestEnvironment(logger);
      configuration = await environment.start();
    },
    1000 * 60 * 45,
  );

  afterAll(
    async () => {
      await environment.shutdown();
    },
    1000 * 60 * 2,
  );

  it(
    'settles with separate buyer and seller runtimes',
    async () => {
      const walletRoot = await mkdtemp(path.join(tmpdir(), 'negotiation-roles-'));
      const result = await runIsolatedNegotiation({
        buyerConfig: configuration.dappConfig,
        sellerConfig: configuration.sellerDappConfig,
        walletRoot,
      });

      expect(result.buyer.pid).not.toBe(result.seller.pid);
      expect(result.buyer.walletAddress).not.toBe(result.seller.walletAddress);
      expect(result.buyer.privateStateStore).not.toBe(result.seller.privateStateStore);
      expect(result.buyer.proofServer).not.toBe(result.seller.proofServer);
      expect(result.observer.pid).not.toBe(result.buyer.pid);
      expect(result.observer.pid).not.toBe(result.seller.pid);
      expect(result.observer.configKeys).toEqual(['contractAddress', 'indexer', 'indexerWS']);
      expect(result.observer.absentFields).toEqual([
        'walletSeed',
        'walletDirectory',
        'privateState',
        'privateStateStore',
        'proofServer',
      ]);
      expect(result.observer.forbiddenEnvironmentKeys).toEqual([]);
      expect(result.relayAudit.every((entry) => entry.forbiddenFieldCount === 0)).toBe(true);
      expect(result.statuses).toEqual([0, 1, 2, 3]);
      expect(result.observerStates.map(({ status }) => status)).toEqual([0, 1, 2, 3]);
      expect(result.finalPrice).toBe(100n);
    },
    1000 * 60 * 15,
  );
});
