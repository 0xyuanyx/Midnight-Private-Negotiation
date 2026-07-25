import { describe, expect, it } from 'vitest';
import type { IsolatedRunResult } from './child-protocol';
import { evaluatePreflight } from './preflight';

const passingResult = (): IsolatedRunResult => ({
  buyer: {
    role: 'buyer',
    pid: 101,
    walletAddress: 'buyer-address',
    privateStateStore: 'negotiation-buyer-private-state',
    proofServer: 'http://buyer-proof',
    localFields: ['agreedPrice', 'buyerLimitRandomness', 'buyerMaxPrice', 'buyerSecretKey', 'priceRandomness', 'role'],
    absentFields: ['sellerLimitRandomness', 'sellerMinPrice', 'sellerSecretKey'],
    nightReady: true,
    dustReady: true,
  },
  seller: {
    role: 'seller',
    pid: 202,
    walletAddress: 'seller-address',
    privateStateStore: 'negotiation-seller-private-state',
    proofServer: 'http://seller-proof',
    localFields: ['role', 'sellerLimitRandomness', 'sellerMinPrice', 'sellerSecretKey'],
    absentFields: ['buyerLimitRandomness', 'buyerMaxPrice', 'buyerSecretKey'],
    nightReady: true,
    dustReady: true,
  },
  observer: {
    pid: 303,
    configKeys: ['contractAddress', 'indexer', 'indexerWS'],
    absentFields: ['walletSeed', 'walletDirectory', 'privateState', 'privateStateStore', 'proofServer'],
    forbiddenEnvironmentKeys: [],
  },
  observerStates: [0, 1, 2, 3].map((status) => ({
    status,
    finalPrice: status === 3 ? '100' : '0',
    buyerCommitmentPrefix: 'aaaa',
    sellerCommitmentPrefix: 'bbbb',
    priceCommitmentPrefix: 'cccc',
  })),
  relayAudit: [
    {
      type: 'PROPOSAL',
      keys: ['dealId', 'price', 'type'],
      forbiddenFieldCount: 0,
    },
  ],
  statuses: [0, 1, 2, 3],
  finalPrice: 100n,
});

describe('isolation preflight', () => {
  it('passes only when runtime, wallet, prover, observer, and relay boundaries hold', () => {
    const report = evaluatePreflight(passingResult());

    expect(report.passed).toBe(true);
    expect(report.checks.every(({ passed }) => passed)).toBe(true);
  });

  it('fails when both roles share a proof server', () => {
    const result = passingResult();
    result.seller.proofServer = result.buyer.proofServer;

    const report = evaluatePreflight(result);

    expect(report.passed).toBe(false);
    expect(report.checks.find(({ id }) => id === 'distinct-proof-servers')?.passed).toBe(false);
  });
});
