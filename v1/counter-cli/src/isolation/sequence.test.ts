import { describe, expect, it } from 'vitest';
import type { IsolationMessage } from './protocol';
import { RoleProtocolSequence } from './sequence';

const contractReady: IsolationMessage = {
  type: 'CONTRACT_READY',
  contractAddress: 'ab'.repeat(32),
};
const proposal: IsolationMessage = {
  type: 'PROPOSAL',
  dealId: '11'.repeat(32),
  price: '100',
};
const priceOpening: IsolationMessage = {
  type: 'PRICE_OPENING',
  dealId: '11'.repeat(32),
  price: '100',
  priceRandomness: '22'.repeat(32),
};

describe('role protocol sequence', () => {
  it('accepts the exact buyer/seller happy-path sequence', () => {
    const sequence = new RoleProtocolSequence();

    sequence.acceptChainState('buyer', 0);
    sequence.acceptRelay('buyer', contractReady);
    sequence.acceptRelay('buyer', proposal);
    sequence.acceptChainState('seller', 1);
    sequence.acceptSignal('seller', 'SELLER_JOINED');
    sequence.acceptChainState('buyer', 2);
    sequence.acceptRelay('buyer', priceOpening);
    sequence.acceptChainState('seller', 3);
    sequence.acceptSignal('seller', 'SETTLED');

    expect(sequence.isComplete()).toBe(true);
  });

  it('rejects wrong-role, duplicate, and out-of-order events', () => {
    const wrongRole = new RoleProtocolSequence();
    expect(() => wrongRole.acceptRelay('seller', contractReady)).toThrow('relay source or phase is invalid');

    const tooEarly = new RoleProtocolSequence();
    expect(() => tooEarly.acceptRelay('buyer', contractReady)).toThrow('relay source or phase is invalid');

    const duplicate = new RoleProtocolSequence();
    duplicate.acceptChainState('buyer', 0);
    duplicate.acceptRelay('buyer', contractReady);
    expect(() => duplicate.acceptRelay('buyer', contractReady)).toThrow('relay source or phase is invalid');

    const outOfOrder = new RoleProtocolSequence();
    expect(() => outOfOrder.acceptChainState('seller', 1)).toThrow('chain state source or phase is invalid');
    outOfOrder.acceptChainState('buyer', 0);
    outOfOrder.acceptRelay('buyer', contractReady);
    outOfOrder.acceptRelay('buyer', proposal);
    expect(() => outOfOrder.acceptRelay('buyer', priceOpening)).toThrow('relay source or phase is invalid');
    expect(() => outOfOrder.acceptSignal('seller', 'SETTLED')).toThrow('settlement signal is out of order');
  });
});
