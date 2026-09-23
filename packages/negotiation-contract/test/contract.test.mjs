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
  priceCommitment,
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
  const sellerKey = publicKeyForSecret(sellerSecretKey);
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
    sellerKey,
    limitCommitment(
      dealId,
      "negotiation:buyer:",
      buyerKey,
      input.buyerMax,
      buyerState.buyerLimitRandomness,
    ),
  );
  const publicTranscripts = [];
  const run = (circuit) => {
    const result = contract.impureCircuits[circuit](context);
    publicTranscripts.push(result.proofData.publicTranscript);
    context = result.context;
  };
  let context = createCircuitContext(
    sampleContractAddress(),
    initial.currentZswapLocalState,
    initial.currentContractState,
    initial.currentPrivateState,
  );
  return {
    ledger: () => Negotiation.ledger(context.currentQueryContext.state),
    publicTranscripts,
    dealId,
    join: () => {
      context.currentPrivateState = sellerState;
      context = contract.impureCircuits.joinDeal(context).context;
    },
    joinAsThirdParty: () => {
      context.currentPrivateState = {
        ...sellerState,
        sellerSecretKey: hexToBytes("99".repeat(32)),
        sellerMinPrice: 0n,
      };
      context = contract.impureCircuits.joinDeal(context).context;
    },
    sellerKey,
    cancelAsSeller: () => {
      context.currentPrivateState = sellerState;
      context = contract.impureCircuits.cancelAsSeller(context).context;
    },
    authorizeAsThirdParty: () => {
      context.currentPrivateState = {
        ...buyerState,
        buyerSecretKey: hexToBytes("99".repeat(32)),
      };
      context = contract.impureCircuits.authorizeHiddenPrice(context).context;
    },
    cancelAsThirdPartyBuyer: () => {
      context.currentPrivateState = {
        ...buyerState,
        buyerSecretKey: hexToBytes("99".repeat(32)),
      };
      context = contract.impureCircuits.cancelAsBuyer(context).context;
    },
    cancelAsThirdPartySeller: () => {
      context.currentPrivateState = {
        ...sellerState,
        sellerSecretKey: hexToBytes("99".repeat(32)),
      };
      context = contract.impureCircuits.cancelAsSeller(context).context;
    },
    authorize: () => {
      context.currentPrivateState = buyerState;
      run("authorizeHiddenPrice");
    },
    settle: (opening = { agreedPrice: input.price, priceRandomness: buyerState.priceRandomness }) => {
      context.currentPrivateState = withSellerPriceOpening(sellerState, opening);
      run("settle");
    },
    settleAsThirdParty: () => {
      context.currentPrivateState = withSellerPriceOpening(
        {
          ...sellerState,
          sellerSecretKey: hexToBytes("99".repeat(32)),
        },
        {
          agreedPrice: input.price,
          priceRandomness: buyerState.priceRandomness,
        },
      );
      context = contract.impureCircuits.settle(context).context;
    },
  };
};

const serializePublic = (value) =>
  JSON.stringify(value, (_key, item) =>
    typeof item === "bigint"
      ? item.toString()
      : item instanceof Uint8Array
        ? Buffer.from(item).toString("hex")
        : item,
  );

// Little-endian hex as the Compact runtime encodes integers in transcripts.
const littleEndianHex = (value) => {
  let hex = value.toString(16);
  if (hex.length % 2 === 1) hex = `0${hex}`;
  return Buffer.from(hex, "hex").reverse().toString("hex");
};

test("settles without putting the agreed price or limits on the public ledger or transcripts", () => {
  const input = scenario({
    buyerMax: 110_000_000n,
    sellerMin: 95_000_000n,
    price: 100_000_000n,
  });
  const simulation = createSimulation(input);
  assert.equal(simulation.ledger().status, Negotiation.DealStatus.WAITING_SELLER);
  assert.equal("finalPrice" in simulation.ledger(), false);

  simulation.join();
  assert.equal(simulation.ledger().status, Negotiation.DealStatus.OPEN);
  simulation.authorize();
  assert.equal(simulation.ledger().status, Negotiation.DealStatus.AUTHORIZED);
  simulation.settle();
  assert.equal(simulation.ledger().status, Negotiation.DealStatus.SETTLED);

  const ledger = simulation.ledger();
  assert.deepEqual(
    Object.keys(ledger).sort(),
    [
      "buyerCommitment",
      "buyerKey",
      "dealId",
      "priceCommitment",
      "sellerCommitment",
      "sellerKey",
      "status",
    ],
  );
  // Either party can reopen the public commitment with its stored opening.
  assert.deepEqual(
    ledger.priceCommitment,
    priceCommitment(
      simulation.dealId,
      input.price,
      hexToBytes(input.priceRandomness),
    ),
  );

  const publicData = serializePublic({
    ledger,
    transcripts: simulation.publicTranscripts,
  });
  assert.equal(simulation.publicTranscripts.length, 2);
  for (const secret of [input.price, input.buyerMax, input.sellerMin]) {
    assert.equal(publicData.includes(littleEndianHex(secret)), false);
    assert.equal(publicData.includes(secret.toString()), false);
  }
  assert.equal(publicData.includes(input.priceRandomness), false);
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

test("rejects third-party settlement and leaves the authorized ledger unchanged", () => {
  const simulation = createSimulation(scenario());
  simulation.join();
  simulation.authorize();
  assert.throws(() => simulation.settleAsThirdParty(), /assert/i);
  assert.equal(simulation.ledger().status, Negotiation.DealStatus.AUTHORIZED);
});

test("pins the Seller at deployment and rejects a third-party joinDeal", () => {
  const simulation = createSimulation(scenario());
  assert.deepEqual(simulation.ledger().sellerKey, simulation.sellerKey);
  assert.throws(() => simulation.joinAsThirdParty(), /caller is not seller/);
  assert.equal(simulation.ledger().status, Negotiation.DealStatus.WAITING_SELLER);

  simulation.join();
  assert.equal(simulation.ledger().status, Negotiation.DealStatus.OPEN);
  assert.deepEqual(simulation.ledger().sellerKey, simulation.sellerKey);
});

test("rejects third-party authorization and cancellation without changing the ledger", () => {
  const simulation = createSimulation(scenario());
  simulation.join();
  assert.throws(() => simulation.authorizeAsThirdParty(), /caller is not buyer/);
  assert.throws(() => simulation.cancelAsThirdPartyBuyer(), /caller is not buyer/);
  assert.throws(() => simulation.cancelAsThirdPartySeller(), /caller is not seller/);
  assert.equal(simulation.ledger().status, Negotiation.DealStatus.OPEN);
});

test("lets the pinned Seller cancel before joining, which closes the deal", () => {
  const simulation = createSimulation(scenario());
  simulation.cancelAsSeller();
  assert.equal(simulation.ledger().status, Negotiation.DealStatus.CANCELLED);
  assert.throws(() => simulation.join(), /deal is not waiting for seller/);
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
