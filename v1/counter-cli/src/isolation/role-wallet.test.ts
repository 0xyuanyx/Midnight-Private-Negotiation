import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getUnshieldedAddressForSeed } from '../api';
import { StandaloneConfig } from '../config';
import { loadOrCreateRoleSeed } from './role-wallet';

describe('role-local wallet seeds', () => {
  it('creates different persistent seeds in separate role directories', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'negotiation-wallets-'));
    const buyerDirectory = path.join(root, 'buyer');
    const sellerDirectory = path.join(root, 'seller');

    const buyerSeed = await loadOrCreateRoleSeed(buyerDirectory);
    const sellerSeed = await loadOrCreateRoleSeed(sellerDirectory);

    expect(buyerSeed).toMatch(/^[0-9a-f]{64}$/u);
    expect(sellerSeed).toMatch(/^[0-9a-f]{64}$/u);
    expect(sellerSeed).not.toBe(buyerSeed);
    expect(await loadOrCreateRoleSeed(buyerDirectory)).toBe(buyerSeed);
    expect((await readFile(path.join(buyerDirectory, 'wallet.seed'), 'utf8')).trim()).toBe(buyerSeed);
    expect((await stat(path.join(buyerDirectory, 'wallet.seed'))).mode & 0o777).toBe(0o600);
  });

  it('derives distinct public addresses without exposing the seed to a wallet process', () => {
    new StandaloneConfig();
    const buyerAddress = getUnshieldedAddressForSeed('01'.repeat(32));
    const sellerAddress = getUnshieldedAddressForSeed('02'.repeat(32));

    expect(buyerAddress).toMatch(/^mn_addr_undeployed/u);
    expect(sellerAddress).toMatch(/^mn_addr_undeployed/u);
    expect(sellerAddress).not.toBe(buyerAddress);
  });
});
