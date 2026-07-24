import path from 'node:path';
import { currentDir } from '../config';
import { createLogger } from '../logger-utils';
import { TestEnvironment } from '../test/commons';
import { runIsolatedNegotiation } from './orchestrator';
import { assertPreflight } from './preflight';

const formatRuntime = (
  label: 'BUYER' | 'SELLER',
  metadata: {
    pid: number;
    walletAddress: string;
    privateStateStore: string;
    proofServer: string;
    localFields: string[];
    absentFields: string[];
  },
): string[] => [
  `[${label}] PID=${metadata.pid} wallet=${metadata.walletAddress}`,
  `[${label}] private-state=${metadata.privateStateStore} prover=${metadata.proofServer}`,
  `[${label}] 보유 필드: ${metadata.localFields.join(', ')}`,
  `[${label}] 구조적으로 없는 필드: ${metadata.absentFields.join(', ')}`,
];

const logger = await createLogger(
  path.resolve(currentDir, '..', 'logs', 'isolated-demo', `${new Date().toISOString()}.log`),
);
const environment = new TestEnvironment(logger);

try {
  console.log('[DEMO] 공유 node/indexer와 역할별 proof server 두 개를 시작합니다.');
  const configuration = await environment.start();
  const result = await runIsolatedNegotiation({
    buyerConfig: configuration.dappConfig,
    sellerConfig: configuration.sellerDappConfig,
    walletRoot: path.resolve(currentDir, '..', '.demo-wallets'),
  });
  const report = assertPreflight(result);

  console.log('\n=== Runtime isolation evidence ===');
  for (const line of formatRuntime('BUYER', result.buyer)) console.log(line);
  for (const line of formatRuntime('SELLER', result.seller)) console.log(line);
  console.log(`[OBSERVER] PID=${result.observer.pid} public-config=${result.observer.configKeys.join(', ')}`);
  console.log(`[OBSERVER] 받지 않은 필드: ${result.observer.absentFields.join(', ')}`);

  console.log('\n=== Relay field audit ===');
  for (const entry of result.relayAudit) {
    console.log(`[RELAY] ${entry.type} keys=${entry.keys.join(',')} forbidden=${entry.forbiddenFieldCount}`);
  }

  console.log('\n=== Public chain states ===');
  for (const state of result.observerStates) {
    console.log(
      `[OBSERVER] status=${state.status} finalPrice=${state.finalPrice} commitments=${[
        state.buyerCommitmentPrefix,
        state.sellerCommitmentPrefix,
        state.priceCommitmentPrefix,
      ].join('/')}`,
    );
  }

  console.log('\n=== Preflight ===');
  for (const check of report.checks) {
    console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.label}`);
  }
  console.log(`\n[DEMO] SETTLED finalPrice=${result.finalPrice.toString()}`);
} catch (error: unknown) {
  console.error(error instanceof Error ? `[DEMO] ${error.message}` : '[DEMO] isolated run failed');
  process.exitCode = 1;
} finally {
  await environment.shutdown();
}
