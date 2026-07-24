import { describe, expect, it } from 'vitest';
import {
  parseFunderEvent,
  parseObserverEvent,
  parseParentToObserverMessage,
  parseRoleToParentMessage,
  type RuntimeMetadata,
} from './child-protocol';

const buyerMetadata = (): RuntimeMetadata => ({
  role: 'buyer',
  pid: 101,
  walletAddress: 'buyer-address',
  privateStateStore: 'negotiation-buyer-private-state',
  proofServer: 'http://buyer-proof',
  localFields: ['agreedPrice', 'buyerLimitRandomness', 'buyerMaxPrice', 'buyerSecretKey', 'priceRandomness', 'role'],
  absentFields: ['sellerLimitRandomness', 'sellerMinPrice', 'sellerSecretKey'],
  nightReady: true,
  dustReady: true,
});

describe('child IPC protocol', () => {
  it('accepts an exact role-ready event', () => {
    const event = { type: 'ROLE_READY', metadata: buyerMetadata() };

    expect(parseRoleToParentMessage('buyer', event)).toEqual(event);
  });

  it('rejects role events with secret or unknown extra fields', () => {
    expect(() =>
      parseRoleToParentMessage('buyer', {
        type: 'WALLET_ADDRESS',
        role: 'buyer',
        walletAddress: 'buyer-address',
        buyerMax: '110',
      }),
    ).toThrow('unexpected child event field');
  });

  it('rejects role and metadata identity spoofing', () => {
    expect(() =>
      parseRoleToParentMessage('buyer', {
        type: 'WALLET_ADDRESS',
        role: 'seller',
        walletAddress: 'seller-address',
      }),
    ).toThrow('child event role does not match source');

    const metadata = buyerMetadata();
    metadata.pid = 202;
    expect(() => parseRoleToParentMessage('buyer', { type: 'ROLE_READY', metadata }, { pid: 101 })).toThrow(
      'child metadata pid does not match process',
    );

    metadata.pid = 101;
    expect(() =>
      parseRoleToParentMessage('buyer', { type: 'ROLE_READY', metadata }, { walletAddress: 'funded-address' }),
    ).toThrow('child metadata wallet address does not match funded address');
  });

  it('allows only fixed error codes, never raw error messages', () => {
    expect(
      parseRoleToParentMessage('buyer', {
        type: 'ERROR',
        role: 'buyer',
        code: 'RUNTIME_FAILED',
      }),
    ).toEqual({ type: 'ERROR', role: 'buyer', code: 'RUNTIME_FAILED' });

    expect(() =>
      parseRoleToParentMessage('buyer', {
        type: 'ERROR',
        role: 'buyer',
        code: 'RUNTIME_FAILED',
        message: 'seed=private',
      }),
    ).toThrow('unexpected child event field');
  });

  it('validates observer and funder events with the same exact-key boundary', () => {
    expect(() =>
      parseObserverEvent({
        type: 'OBSERVER_READY',
        metadata: {
          pid: 303,
          configKeys: ['contractAddress', 'indexer', 'indexerWS'],
          absentFields: ['walletSeed'],
          forbiddenEnvironmentKeys: [],
          walletSeed: 'private',
        },
      }),
    ).toThrow('unexpected observer metadata field');

    expect(parseFunderEvent({ type: 'FUNDER_DONE' })).toEqual({ type: 'FUNDER_DONE' });
    expect(() =>
      parseFunderEvent({
        type: 'ERROR',
        role: 'funder',
        code: 'RUNTIME_FAILED',
        message: 'private context',
      }),
    ).toThrow('unexpected funder event field');
  });

  it('validates parent-to-observer messages at runtime', () => {
    expect(parseParentToObserverMessage({ type: 'OBSERVE', expectedStatus: 2 })).toEqual({
      type: 'OBSERVE',
      expectedStatus: 2,
    });
    expect(() => parseParentToObserverMessage({ type: 'OBSERVE', expectedStatus: 2, walletSeed: 'private' })).toThrow(
      'unexpected parent observer message field',
    );
    expect(() => parseParentToObserverMessage({ type: 'OBSERVE', expectedStatus: 4 })).toThrow(
      'observer expected status must be an integer',
    );
  });
});
