import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
  type CircuitContext
} from "@midnight-ntwrk/compact-runtime";
import {
  hexToBytes,
  limitCommitment,
  publicKeyForSecret
} from "../commitments.js";
import {
  Contract,
  DealStatus,
  ledger,
  type Ledger
} from "../managed/negotiation/contract/index.js";
import {
  type BuyerPrivateState,
  type NegotiationPrivateState,
  type SellerPrivateState,
  type SellerPriceOpening,
  withSellerPriceOpening,
  witnesses
} from "../witnesses.js";

export type NegotiationScenario = {
  dealId: string;
  buyerSecretKey: string;
  sellerSecretKey: string;
  buyerMax: bigint;
  sellerMin: bigint;
  price: bigint;
  buyerLimitRandomness: string;
  sellerLimitRandomness: string;
  priceRandomness: string;
};

export type PriceWitness = {
  price: bigint;
  randomness: string;
};

export class NegotiationSimulator {
  readonly contract: Contract<NegotiationPrivateState>;
  readonly expectedSellerKey: Uint8Array;
  readonly expectedSellerCommitment: Uint8Array;
  private readonly buyerPrivateState: BuyerPrivateState;
  private readonly sellerPrivateState: SellerPrivateState;
  private priceWitness: SellerPriceOpening;
  circuitContext: CircuitContext<NegotiationPrivateState>;

  constructor(scenario: NegotiationScenario) {
    const dealId = hexToBytes(scenario.dealId);
    const buyerSecretKey = hexToBytes(scenario.buyerSecretKey);
    const sellerSecretKey = hexToBytes(scenario.sellerSecretKey);
    const buyerKey = publicKeyForSecret(buyerSecretKey);
    const sellerKey = publicKeyForSecret(sellerSecretKey);
    const buyerCommitment = limitCommitment(
      dealId,
      "negotiation:buyer:",
      buyerKey,
      scenario.buyerMax,
      hexToBytes(scenario.buyerLimitRandomness)
    );
    const sellerCommitment = limitCommitment(
      dealId,
      "negotiation:seller:",
      sellerKey,
      scenario.sellerMin,
      hexToBytes(scenario.sellerLimitRandomness)
    );
    this.expectedSellerKey = sellerKey;
    this.expectedSellerCommitment = sellerCommitment;

    this.buyerPrivateState = {
      role: "buyer",
      buyerSecretKey,
      buyerMaxPrice: scenario.buyerMax,
      buyerLimitRandomness: hexToBytes(scenario.buyerLimitRandomness),
      agreedPrice: scenario.price,
      priceRandomness: hexToBytes(scenario.priceRandomness)
    };
    this.sellerPrivateState = {
      role: "seller",
      sellerSecretKey,
      sellerMinPrice: scenario.sellerMin,
      sellerLimitRandomness: hexToBytes(scenario.sellerLimitRandomness)
    };
    this.priceWitness = {
      agreedPrice: scenario.price,
      priceRandomness: hexToBytes(scenario.priceRandomness)
    };

    this.contract = new Contract<NegotiationPrivateState>(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState
    } = this.contract.initialState(
      createConstructorContext(this.buyerPrivateState, "0".repeat(64)),
      dealId,
      buyerKey,
      buyerCommitment
    );
    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState
    );
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  joinDeal(): void {
    this.circuitContext.currentPrivateState = this.sellerPrivateState;
    this.circuitContext = this.contract.impureCircuits.joinDeal(
      this.circuitContext
    ).context;
  }

  authorizeHiddenPrice(): void {
    this.circuitContext.currentPrivateState = this.buyerPrivateState;
    this.circuitContext = this.contract.impureCircuits.authorizeHiddenPrice(
      this.circuitContext
    ).context;
  }

  settle(): void {
    this.circuitContext.currentPrivateState = withSellerPriceOpening(
      this.sellerPrivateState,
      this.priceWitness
    );
    this.circuitContext = this.contract.impureCircuits.settle(
      this.circuitContext
    ).context;
  }

  setPriceWitness(witness: PriceWitness): void {
    this.priceWitness = {
      agreedPrice: witness.price,
      priceRandomness: hexToBytes(witness.randomness)
    };
  }
}

export { DealStatus };
