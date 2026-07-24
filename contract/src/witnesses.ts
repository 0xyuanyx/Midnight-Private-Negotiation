import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import type {
  Ledger,
  Witnesses
} from "./managed/negotiation/contract/index.js";

export type BuyerPrivateState = {
  role: "buyer";
  buyerSecretKey: Uint8Array;
  buyerMaxPrice: bigint;
  buyerLimitRandomness: Uint8Array;
  agreedPrice: bigint;
  priceRandomness: Uint8Array;
};

export type SellerPriceOpening = {
  agreedPrice: bigint;
  priceRandomness: Uint8Array;
};

export type SellerPrivateState = {
  role: "seller";
  sellerSecretKey: Uint8Array;
  sellerMinPrice: bigint;
  sellerLimitRandomness: Uint8Array;
  priceOpening?: SellerPriceOpening;
};

export type NegotiationPrivateState = BuyerPrivateState | SellerPrivateState;

type Context = WitnessContext<Ledger, NegotiationPrivateState>;

const requireBuyer = (context: Context): BuyerPrivateState => {
  if (context.privateState.role !== "buyer") {
    throw new Error("buyer witness requires buyer private state");
  }
  return context.privateState;
};

const requireSeller = (context: Context): SellerPrivateState => {
  if (context.privateState.role !== "seller") {
    throw new Error("seller witness requires seller private state");
  }
  return context.privateState;
};

const requirePriceOpening = (state: SellerPrivateState): SellerPriceOpening => {
  if (state.priceOpening === undefined) {
    throw new Error("seller price opening is not available");
  }
  return state.priceOpening;
};

export const withSellerPriceOpening = (
  state: SellerPrivateState,
  priceOpening: SellerPriceOpening
): SellerPrivateState => ({
  ...state,
  priceOpening
});

export const witnesses: Witnesses<NegotiationPrivateState> = {
  buyerSecretKey: (context: Context) => {
    const state = requireBuyer(context);
    return [state, state.buyerSecretKey];
  },
  sellerSecretKey: (context: Context) => {
    const state = requireSeller(context);
    return [state, state.sellerSecretKey];
  },
  buyerCancelSecretKey: (context: Context) => {
    const state = requireBuyer(context);
    return [state, state.buyerSecretKey];
  },
  sellerCancelSecretKey: (context: Context) => {
    const state = requireSeller(context);
    return [state, state.sellerSecretKey];
  },
  buyerMaxPrice: (context: Context) => {
    const state = requireBuyer(context);
    return [state, state.buyerMaxPrice];
  },
  buyerLimitRandomness: (context: Context) => {
    const state = requireBuyer(context);
    return [state, state.buyerLimitRandomness];
  },
  agreedPrice: (context: Context) => {
    const state = context.privateState;
    const agreedPrice =
      state.role === "buyer"
        ? state.agreedPrice
        : requirePriceOpening(state).agreedPrice;
    return [state, agreedPrice];
  },
  priceRandomness: (context: Context) => {
    const state = context.privateState;
    const priceRandomness =
      state.role === "buyer"
        ? state.priceRandomness
        : requirePriceOpening(state).priceRandomness;
    return [state, priceRandomness];
  },
  sellerMinPrice: (context: Context) => {
    const state = requireSeller(context);
    return [state, state.sellerMinPrice];
  },
  sellerLimitRandomness: (context: Context) => {
    const state = requireSeller(context);
    return [state, state.sellerLimitRandomness];
  }
};
