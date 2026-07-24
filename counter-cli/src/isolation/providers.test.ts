import { type BuyerPrivateState, type SellerPrivateState } from '@midnight-ntwrk/counter-contract';
import { describe, expect, it, vi } from 'vitest';
import { storeSellerPriceOpening } from '../api';
import { type NegotiationProviders, NegotiationPrivateStateId } from '../common-types';
import { privateStateStoreNameFor } from '../config';

const contractAddress = 'ab'.repeat(32);
const priceRandomness = new Uint8Array(32).fill(7);

const sellerState: SellerPrivateState = {
  role: 'seller',
  sellerSecretKey: new Uint8Array(32),
  sellerMinPrice: 95n,
  sellerLimitRandomness: new Uint8Array(32),
};

const buyerState: BuyerPrivateState = {
  role: 'buyer',
  buyerSecretKey: new Uint8Array(32),
  buyerMaxPrice: 110n,
  buyerLimitRandomness: new Uint8Array(32),
  agreedPrice: 100n,
  priceRandomness,
};

const providersWithState = (state: BuyerPrivateState | SellerPrivateState) => {
  const privateStateProvider = {
    setContractAddress: vi.fn(),
    get: vi.fn().mockResolvedValue(state),
    set: vi.fn().mockResolvedValue(undefined),
  };
  return {
    providers: { privateStateProvider } as unknown as NegotiationProviders,
    privateStateProvider,
  };
};

describe('role-scoped providers', () => {
  it('uses different private-state stores for each role', () => {
    expect(privateStateStoreNameFor('buyer')).toBe('negotiation-buyer-private-state');
    expect(privateStateStoreNameFor('seller')).toBe('negotiation-seller-private-state');
  });

  it('stores a received price opening only in seller state', async () => {
    const { providers, privateStateProvider } = providersWithState(sellerState);

    await storeSellerPriceOpening(providers, contractAddress, {
      agreedPrice: 100n,
      priceRandomness,
    });

    expect(privateStateProvider.setContractAddress).toHaveBeenCalledWith(contractAddress);
    expect(privateStateProvider.set).toHaveBeenCalledWith(NegotiationPrivateStateId, {
      ...sellerState,
      priceOpening: { agreedPrice: 100n, priceRandomness },
    });
  });

  it('rejects updating buyer state with a seller opening', async () => {
    const { providers, privateStateProvider } = providersWithState(buyerState);

    await expect(
      storeSellerPriceOpening(providers, contractAddress, {
        agreedPrice: 100n,
        priceRandomness,
      }),
    ).rejects.toThrow('seller price opening requires seller private state');
    expect(privateStateProvider.set).not.toHaveBeenCalled();
  });
});
