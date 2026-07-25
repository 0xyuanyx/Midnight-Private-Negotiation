import assert from "node:assert/strict";
import test from "node:test";
import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import {
  Negotiation,
  hexToBytes,
  limitCommitment,
  publicKeyForSecret,
  withSellerPriceOpening,
  witnesses,
} from "../dist/index.js";

const scenario = (overrides = {}) => ({
  dealId: "11".repeat(32),
  buyerSecretKey: "44".repeat(32),
  sellerSecretKey: "55".repeat(32),
  buyerMax: 110_000n,
  sellerMin: 95_000n,
  price: 100_000n,
  buyerRandomness: "66".repeat(32),
  sellerRandomness: "77".repeat(32),
  priceRandomness: "88".repeat(32),
  ...overrides,
});

const createSimulation = (input) => {
  const dealId = hexToBytes(input.dealId);
  const buyerSecretKey = hexToBytes(input.buyerSecretKey);
  const sellerSecretKey = hexToBytes(input.sellerSecretKey);
  const buyerKey = publicKeyForSecret(buyerSecretKey);
  const buyerState = {
    role: "buyer",
    buyerSecretKey,
    buyerMaxPrice: input.buyerMax,
    buyerLimitRandomness: hexToBytes(input.buyerRandomness),
    agreedPrice: input.price,
    priceRandomness: hexToBytes(input.priceRandomness),
  };
  const sellerState = {
    role: "seller",
    sellerSecretKey,
    sellerMinPrice: input.sellerMin,
    sellerLimitRandomness: hexToBytes(input.sellerRandomness),
  };
  const contract = new Negotiation.Contract(witnesses);
  const initial = contract.initialState(
    createConstructorContext(buyerState, "0".repeat(64)),
    dealId,
    buyerKey,
    limitCommitment(
      dealId,
      "negotiation:buyer:",
      buyerKey,
      input.buyerMax,
      buyerState.buyerLimitRandomness,
    ),
  );
  let context = createCircuitContext(
    sampleContractAddress(),
    initial.currentZswapLocalState,
    initial.currentContractState,
    initial.currentPrivateState,
  );
  return {
    ledger: () => Negotiation.ledger(context.currentQueryContext.state),
    join: () => {
      context.currentPrivateState = sellerState;
      context = contract.impureCircuits.joinDeal(context).context;
    },
    authorize: () => {
      context.currentPrivateState = buyerState;
      context = contract.impureCircuits.authorizeHiddenPrice(context).context;
    },
    settle: (opening = { agreedPrice: input.price, priceRandomness: buyerState.priceRandomness }) => {
      context.currentPrivateState = withSellerPriceOpening(sellerState, opening);
      context = contract.impureCircuits.settle(context).context;
    },
  };
};

test("supports KRW prices above the old Uint16 ceiling and reveals only at SETTLED", () => {
  const simulation = createSimulation(scenario());
  assert.equal(simulation.ledger().status, Negotiation.DealStatus.WAITING_SELLER);
  assert.equal(simulation.ledger().finalPrice, 0n);

  simulation.join();
  assert.equal(simulation.ledger().status, Negotiation.DealStatus.OPEN);
  simulation.authorize();
  assert.equal(simulation.ledger().status, Negotiation.DealStatus.AUTHORIZED);
  assert.equal(simulation.ledger().finalPrice, 0n);
  simulation.settle();

  assert.equal(simulation.ledger().status, Negotiation.DealStatus.SETTLED);
  assert.equal(simulation.ledger().finalPrice, 100_000n);
});

test("rejects prices outside either committed private limit", () => {
  const aboveBuyer = createSimulation(
    scenario({ buyerMax: 90_000n, price: 100_000n }),
  );
  aboveBuyer.join();
  assert.throws(() => aboveBuyer.authorize());

  const belowSeller = createSimulation(
    scenario({ sellerMin: 105_000n, price: 100_000n }),
  );
  belowSeller.join();
  belowSeller.authorize();
  assert.throws(() => belowSeller.settle());
});

test("rejects a Seller opening that differs from the Buyer commitment", () => {
  const simulation = createSimulation(scenario());
  simulation.join();
  simulation.authorize();
  assert.throws(() =>
    simulation.settle({
      agreedPrice: 99_000n,
      priceRandomness: hexToBytes("88".repeat(32)),
    }),
  );
});

test("enforces the Uint64 price boundary in off-chain commitments", () => {
  const dealId = hexToBytes("11".repeat(32));
  const key = publicKeyForSecret(hexToBytes("44".repeat(32)));
  const randomness = hexToBytes("66".repeat(32));
  assert.doesNotThrow(() =>
    limitCommitment(
      dealId,
      "negotiation:buyer:",
      key,
      18_446_744_073_709_551_615n,
      randomness,
    ),
  );
  assert.throws(() =>
    limitCommitment(
      dealId,
      "negotiation:buyer:",
      key,
      18_446_744_073_709_551_616n,
      randomness,
    ),
  );
});
