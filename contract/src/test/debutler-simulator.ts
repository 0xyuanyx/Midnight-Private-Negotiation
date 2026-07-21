import {
  CompactTypeBytes,
  CompactTypeVector,
  convertFieldToBytes,
  createCircuitContext,
  createConstructorContext,
  persistentHash,
  sampleContractAddress,
  type CircuitContext
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  DealStatus,
  ledger,
  type Ledger
} from "../managed/debutler/contract/index.js";
import { type DebutlerPrivateState, witnesses } from "../witnesses.js";

const bytesType = new CompactTypeBytes(32);
const hash2Type = new CompactTypeVector(2, bytesType);
const hash4Type = new CompactTypeVector(4, bytesType);
const hash5Type = new CompactTypeVector(5, bytesType);

export type DebutlerScenario = {
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

const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const pad32 = (value: string): Uint8Array => {
  const result = new Uint8Array(32);
  for (let index = 0; index < Math.min(value.length, 32); index += 1) {
    result[index] = value.charCodeAt(index);
  }
  return result;
};

const asFieldBytes = (value: bigint): Uint8Array =>
  convertFieldToBytes(32, value, "debutler simulator");

export const publicKeyForSecret = (secret: Uint8Array): Uint8Array =>
  persistentHash(hash2Type, [pad32("de-butler:public-key:"), secret]);

export const limitCommitment = (
  dealId: Uint8Array,
  role: string,
  key: Uint8Array,
  limit: bigint,
  randomness: Uint8Array
): Uint8Array =>
  persistentHash(hash5Type, [
    dealId,
    pad32(role),
    key,
    asFieldBytes(limit),
    randomness
  ]);

export const priceCommitment = (
  dealId: Uint8Array,
  price: bigint,
  randomness: Uint8Array
): Uint8Array =>
  persistentHash(hash4Type, [
    dealId,
    pad32("de-butler:price:"),
    asFieldBytes(price),
    randomness
  ]);

export class DebutlerSimulator {
  readonly contract: Contract<DebutlerPrivateState>;
  circuitContext: CircuitContext<DebutlerPrivateState>;

  constructor(scenario: DebutlerScenario) {
    const dealId = hexToBytes(scenario.dealId);
    const buyerSecretKey = hexToBytes(scenario.buyerSecretKey);
    const sellerSecretKey = hexToBytes(scenario.sellerSecretKey);
    const buyerKey = publicKeyForSecret(buyerSecretKey);
    const sellerKey = publicKeyForSecret(sellerSecretKey);
    const buyerCommitment = limitCommitment(
      dealId,
      "de-butler:buyer:",
      buyerKey,
      scenario.buyerMax,
      hexToBytes(scenario.buyerLimitRandomness)
    );
    const sellerCommitment = limitCommitment(
      dealId,
      "de-butler:seller:",
      sellerKey,
      scenario.sellerMin,
      hexToBytes(scenario.sellerLimitRandomness)
    );

    const privateState: DebutlerPrivateState = {
      buyerSecretKey,
      sellerSecretKey,
      buyerMaxPrice: scenario.buyerMax,
      buyerLimitRandomness: hexToBytes(scenario.buyerLimitRandomness),
      agreedPrice: scenario.price,
      priceRandomness: hexToBytes(scenario.priceRandomness),
      sellerMinPrice: scenario.sellerMin,
      sellerLimitRandomness: hexToBytes(scenario.sellerLimitRandomness)
    };

    this.contract = new Contract<DebutlerPrivateState>(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState
    } = this.contract.initialState(
      createConstructorContext(privateState, "0".repeat(64)),
      dealId,
      buyerKey,
      sellerKey,
      buyerCommitment,
      sellerCommitment
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

  authorizeHiddenPrice(): void {
    this.circuitContext = this.contract.impureCircuits.authorizeHiddenPrice(
      this.circuitContext
    ).context;
  }

  settle(): void {
    this.circuitContext = this.contract.impureCircuits.settle(
      this.circuitContext
    ).context;
  }

  setPriceWitness(witness: PriceWitness): void {
    this.circuitContext.currentPrivateState.agreedPrice = witness.price;
    this.circuitContext.currentPrivateState.priceRandomness = hexToBytes(
      witness.randomness
    );
  }
}

export { DealStatus };
