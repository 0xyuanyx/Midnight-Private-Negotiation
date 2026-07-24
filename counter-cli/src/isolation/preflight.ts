import type { IsolatedRunResult } from './child-protocol';

export type PreflightCheck = {
  id: string;
  label: string;
  passed: boolean;
};

export type PreflightReport = {
  passed: boolean;
  checks: PreflightCheck[];
};

const sameNumbers = (actual: number[], expected: number[]): boolean =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index]);

const sameStrings = (actual: string[], expected: string[]): boolean =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index]);

export const evaluatePreflight = (result: IsolatedRunResult): PreflightReport => {
  const observerStatuses = result.observerStates.map(({ status }) => status);
  const expectedStatuses = [0, 1, 2, 3];
  const expectedObserverKeys = ['contractAddress', 'indexer', 'indexerWS'];
  const observerForbiddenFields = ['walletSeed', 'walletDirectory', 'privateState', 'privateStateStore', 'proofServer'];
  const checks: PreflightCheck[] = [
    {
      id: 'distinct-processes',
      label: 'Buyer, Seller, Observer use distinct process IDs',
      passed: new Set([result.buyer.pid, result.seller.pid, result.observer.pid]).size === 3,
    },
    {
      id: 'distinct-wallets',
      label: 'Buyer and Seller use distinct public wallet addresses',
      passed: result.buyer.walletAddress !== result.seller.walletAddress,
    },
    {
      id: 'wallet-funding',
      label: 'Both role wallets have NIGHT and DUST available',
      passed: result.buyer.nightReady && result.buyer.dustReady && result.seller.nightReady && result.seller.dustReady,
    },
    {
      id: 'distinct-private-state',
      label: 'Buyer and Seller use distinct private-state stores',
      passed: result.buyer.privateStateStore !== result.seller.privateStateStore,
    },
    {
      id: 'role-state-shapes',
      label: 'Role metadata matches the fields present in each constructed private state',
      passed:
        sameStrings(result.buyer.localFields, [
          'agreedPrice',
          'buyerLimitRandomness',
          'buyerMaxPrice',
          'buyerSecretKey',
          'priceRandomness',
          'role',
        ]) &&
        sameStrings(result.buyer.absentFields, ['sellerLimitRandomness', 'sellerMinPrice', 'sellerSecretKey']) &&
        sameStrings(result.seller.localFields, [
          'role',
          'sellerLimitRandomness',
          'sellerMinPrice',
          'sellerSecretKey',
        ]) &&
        sameStrings(result.seller.absentFields, ['buyerLimitRandomness', 'buyerMaxPrice', 'buyerSecretKey']),
    },
    {
      id: 'distinct-proof-servers',
      label: 'Buyer and Seller use distinct proof-server endpoints',
      passed: result.buyer.proofServer !== result.seller.proofServer,
    },
    {
      id: 'observer-public-only',
      label: 'Observer receives public indexer and contract configuration only',
      passed:
        sameNumbers(
          result.observer.configKeys.map((key) => expectedObserverKeys.indexOf(key)),
          [0, 1, 2],
        ) &&
        result.observer.forbiddenEnvironmentKeys.length === 0 &&
        observerForbiddenFields.every((field) => result.observer.absentFields.includes(field)),
    },
    {
      id: 'relay-allowlist',
      label: 'Relay forwarded no forbidden fields',
      passed: result.relayAudit.every(({ forbiddenFieldCount }) => forbiddenFieldCount === 0),
    },
    {
      id: 'public-lifecycle',
      label: 'Role and Observer public states both follow 0 → 1 → 2 → 3',
      passed: sameNumbers(result.statuses, expectedStatuses) && sameNumbers(observerStatuses, expectedStatuses),
    },
    {
      id: 'settlement',
      label: 'Public final price is disclosed only at settlement',
      passed:
        result.finalPrice === 100n &&
        result.observerStates.slice(0, -1).every(({ finalPrice }) => finalPrice === '0') &&
        result.observerStates.at(-1)?.finalPrice === '100',
    },
  ];
  return {
    passed: checks.every(({ passed }) => passed),
    checks,
  };
};

export const assertPreflight = (result: IsolatedRunResult): PreflightReport => {
  const report = evaluatePreflight(result);
  if (!report.passed) {
    const failed = report.checks.filter(({ passed }) => !passed).map(({ id }) => id);
    throw new Error(`isolation preflight failed: ${failed.join(', ')}`);
  }
  return report;
};
