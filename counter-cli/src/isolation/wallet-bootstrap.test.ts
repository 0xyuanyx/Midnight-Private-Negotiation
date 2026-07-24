import { describe, expect, it } from 'vitest';
import type { WalletContext } from '../api';
import { fundWallet } from './wallet-bootstrap';

describe('wallet bootstrap', () => {
  it('rejects non-positive funding without touching the wallet', async () => {
    const funder = {
      wallet: {
        transferTransaction: () => {
          throw new Error('wallet should not be called');
        },
      },
    } as unknown as WalletContext;

    await expect(fundWallet(funder, 'public-address', 0n)).rejects.toThrow('wallet funding amount must be positive');
  });
});
