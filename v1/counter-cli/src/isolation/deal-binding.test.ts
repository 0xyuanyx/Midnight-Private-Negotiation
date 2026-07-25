import { describe, expect, it } from 'vitest';
import { assertDealBinding } from './deal-binding';

const publicDealId = '11'.repeat(32);
const proposal = { type: 'PROPOSAL' as const, dealId: publicDealId, price: '100' };
const opening = {
  type: 'PRICE_OPENING' as const,
  dealId: publicDealId,
  price: '100',
  priceRandomness: '22'.repeat(32),
};

describe('relay deal binding', () => {
  it('accepts a proposal and opening bound to the public ledger deal', () => {
    expect(() => assertDealBinding(publicDealId, proposal, opening)).not.toThrow();
  });

  it('rejects a relay that rewrites both message deal IDs together', () => {
    const otherDealId = '33'.repeat(32);

    expect(() =>
      assertDealBinding(publicDealId, { ...proposal, dealId: otherDealId }, { ...opening, dealId: otherDealId }),
    ).toThrow('proposal does not match public deal');
  });

  it('rejects an opening that differs from the accepted proposal', () => {
    expect(() => assertDealBinding(publicDealId, proposal, { ...opening, price: '101' })).toThrow(
      'price opening does not match accepted proposal',
    );
  });
});
