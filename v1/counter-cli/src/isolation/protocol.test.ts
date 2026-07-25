import { describe, expect, it } from 'vitest';
import { parseIsolationMessage, relayAudit } from './protocol';

const contractAddress = 'ab'.repeat(32);
const dealId = '11'.repeat(32);
const priceRandomness = '22'.repeat(32);

describe('isolation relay protocol', () => {
  it('accepts only the three public protocol messages', () => {
    expect(parseIsolationMessage({ type: 'CONTRACT_READY', contractAddress })).toEqual({
      type: 'CONTRACT_READY',
      contractAddress,
    });
    expect(parseIsolationMessage({ type: 'PROPOSAL', dealId, price: '100' })).toEqual({
      type: 'PROPOSAL',
      dealId,
      price: '100',
    });
    expect(
      parseIsolationMessage({
        type: 'PRICE_OPENING',
        dealId,
        price: '100',
        priceRandomness,
      }),
    ).toEqual({
      type: 'PRICE_OPENING',
      dealId,
      price: '100',
      priceRandomness,
    });
  });

  it.each([
    'buyerMax',
    'sellerMin',
    'buyerLimitRandomness',
    'sellerLimitRandomness',
    'buyerSecretKey',
    'sellerSecretKey',
    'walletSeed',
    'privateState',
  ])('rejects forbidden field %s', (field) => {
    expect(() =>
      parseIsolationMessage({
        type: 'PROPOSAL',
        dealId,
        price: '100',
        [field]: 'private',
      }),
    ).toThrow(`forbidden relay field: ${field}`);
  });

  it('rejects unknown fields even when they are not secret', () => {
    expect(() =>
      parseIsolationMessage({
        type: 'CONTRACT_READY',
        contractAddress,
        note: 'extra',
      }),
    ).toThrow('unexpected relay field: note');
  });

  it('requires every field to be an own property', () => {
    const inherited = Object.create({ dealId }) as Record<string, unknown>;
    inherited.type = 'PROPOSAL';
    inherited.price = '100';

    expect(() => parseIsolationMessage(inherited)).toThrow('missing relay field: dealId');
  });

  it('rejects missing fields and unknown message kinds', () => {
    expect(() => parseIsolationMessage({ type: 'PROPOSAL', dealId })).toThrow('missing relay field: price');
    expect(() => parseIsolationMessage({ type: 'COUNTER_PROPOSAL' })).toThrow('unknown relay message type');
  });

  it('rejects invalid public values', () => {
    expect(() =>
      parseIsolationMessage({
        type: 'CONTRACT_READY',
        contractAddress: 'not-an-address',
      }),
    ).toThrow('contractAddress must be 32-byte hex');
    expect(() =>
      parseIsolationMessage({
        type: 'PROPOSAL',
        dealId,
        price: '-1',
      }),
    ).toThrow('price must be an unsigned decimal integer');
    expect(() =>
      parseIsolationMessage({
        type: 'PRICE_OPENING',
        dealId,
        price: '100',
        priceRandomness: 'short',
      }),
    ).toThrow('priceRandomness must be 32-byte hex');
  });

  it('audits field names without retaining values', () => {
    const audit = relayAudit({
      type: 'PRICE_OPENING',
      dealId,
      price: '100',
      priceRandomness,
    });

    expect(audit).toEqual({
      type: 'PRICE_OPENING',
      keys: ['dealId', 'price', 'priceRandomness', 'type'],
      forbiddenFieldCount: 0,
    });
    expect(JSON.stringify(audit)).not.toContain('100');
    expect(JSON.stringify(audit)).not.toContain(priceRandomness);
  });
});
