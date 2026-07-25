// This file is part of midnightntwrk/example-counter.
// Copyright (C) Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  Negotiation,
  hexToBytes,
  limitCommitment,
  publicKeyForSecret,
  withSellerPriceOpening,
  type BuyerPrivateState,
  type SellerPrivateState,
} from '@midnight-ntwrk/counter-contract';
import { type WalletContext } from '../api';
import path from 'path';
import * as api from '../api';
import { NegotiationPrivateStateId, type NegotiationProviders } from '../common-types';
import { currentDir } from '../config';
import { createLogger } from '../logger-utils';
import { TestEnvironment } from './commons';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const logDir = path.resolve(currentDir, '..', 'logs', 'tests', `${new Date().toISOString()}.log`);
const logger = await createLogger(logDir);

describe('API', () => {
  let testEnvironment: TestEnvironment;
  let walletCtx: WalletContext;
  let providers: NegotiationProviders;

  beforeAll(
    async () => {
      api.setLogger(logger);
      testEnvironment = new TestEnvironment(logger);
      const testConfiguration = await testEnvironment.start();
      walletCtx = await testEnvironment.getWallet();
      providers = await api.configureProviders(walletCtx, testConfiguration.dappConfig, 'buyer');
    },
    1000 * 60 * 45,
  );

  afterAll(async () => {
    await testEnvironment.shutdown();
  });

  it('should execute the staged negotiation lifecycle [@slow]', async () => {
    const dealId = hexToBytes('11'.repeat(32));
    const buyerSecretKey = hexToBytes('44'.repeat(32));
    const buyerKey = publicKeyForSecret(buyerSecretKey);
    const buyerPrivateState: BuyerPrivateState = {
      role: 'buyer',
      buyerSecretKey,
      buyerMaxPrice: 110n,
      buyerLimitRandomness: hexToBytes('66'.repeat(32)),
      agreedPrice: 100n,
      priceRandomness: hexToBytes('88'.repeat(32)),
    };
    const sellerPrivateState: SellerPrivateState = {
      role: 'seller',
      sellerSecretKey: hexToBytes('55'.repeat(32)),
      sellerMinPrice: 95n,
      sellerLimitRandomness: hexToBytes('77'.repeat(32)),
    };
    const buyerCommitment = limitCommitment(
      dealId,
      'negotiation:buyer:',
      buyerKey,
      buyerPrivateState.buyerMaxPrice,
      buyerPrivateState.buyerLimitRandomness,
    );
    const contract = await api.deploy(providers, buyerPrivateState, {
      dealId,
      buyerKey,
      buyerCommitment,
    });
    const contractAddress = contract.deployTxData.public.contractAddress;
    const activatePrivateState = async (state: BuyerPrivateState | SellerPrivateState): Promise<void> => {
      providers.privateStateProvider.setContractAddress(contractAddress);
      await providers.privateStateProvider.set(NegotiationPrivateStateId, state);
    };

    expect((await api.getNegotiationLedgerState(providers, contract)).status).toBe(
      Negotiation.DealStatus.WAITING_SELLER,
    );

    await activatePrivateState(sellerPrivateState);
    const joined = await api.joinDeal(contract);
    expect(joined.txHash).toMatch(/[0-9a-f]{64}/);
    expect((await api.getNegotiationLedgerState(providers, contract)).status).toBe(Negotiation.DealStatus.OPEN);

    await activatePrivateState(buyerPrivateState);
    await api.authorizeHiddenPrice(contract);
    const authorized = await api.getNegotiationLedgerState(providers, contract);
    expect(authorized.status).toBe(Negotiation.DealStatus.AUTHORIZED);
    expect(authorized.finalPrice).toBe(0n);

    await activatePrivateState(
      withSellerPriceOpening(sellerPrivateState, {
        agreedPrice: buyerPrivateState.agreedPrice,
        priceRandomness: buyerPrivateState.priceRandomness,
      }),
    );
    await api.settle(contract);
    const settled = await api.getNegotiationLedgerState(providers, contract);
    expect(settled.status).toBe(Negotiation.DealStatus.SETTLED);
    expect(settled.finalPrice).toBe(100n);
  });
});
