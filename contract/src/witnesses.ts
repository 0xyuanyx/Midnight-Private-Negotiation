import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import type { Ledger, Witnesses } from "./managed/debutler/contract/index.js";

export type DebutlerPrivateState = {
  buyerSecretKey: Uint8Array;
  sellerSecretKey: Uint8Array;
  buyerMaxPrice: bigint;
  buyerLimitRandomness: Uint8Array;
  agreedPrice: bigint;
  priceRandomness: Uint8Array;
  sellerMinPrice: bigint;
  sellerLimitRandomness: Uint8Array;
};

type Context = WitnessContext<Ledger, DebutlerPrivateState>;

export const witnesses: Witnesses<DebutlerPrivateState> = {
  buyerSecretKey: (context: Context) => [
    context.privateState,
    context.privateState.buyerSecretKey
  ],
  sellerSecretKey: (context: Context) => [
    context.privateState,
    context.privateState.sellerSecretKey
  ],
  buyerCancelSecretKey: (context: Context) => [
    context.privateState,
    context.privateState.buyerSecretKey
  ],
  sellerCancelSecretKey: (context: Context) => [
    context.privateState,
    context.privateState.sellerSecretKey
  ],
  buyerMaxPrice: (context: Context) => [
    context.privateState,
    context.privateState.buyerMaxPrice
  ],
  buyerLimitRandomness: (context: Context) => [
    context.privateState,
    context.privateState.buyerLimitRandomness
  ],
  agreedPrice: (context: Context) => [
    context.privateState,
    context.privateState.agreedPrice
  ],
  priceRandomness: (context: Context) => [
    context.privateState,
    context.privateState.priceRandomness
  ],
  sellerMinPrice: (context: Context) => [
    context.privateState,
    context.privateState.sellerMinPrice
  ],
  sellerLimitRandomness: (context: Context) => [
    context.privateState,
    context.privateState.sellerLimitRandomness
  ]
};
