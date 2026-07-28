import {
  generateAllowedCandidate,
  generateLocalFallbackCandidate,
} from "../packages/agent-core/dist/index.js";

const chooseCandidate = async ({ provider, context, policy }) => {
  const modelCandidate = await generateAllowedCandidate({
    provider,
    context,
    policy,
    maxStatelessRequests: 1,
  });
  if (modelCandidate !== undefined) {
    return { candidate: modelCandidate, fromModel: true };
  }
  return {
    candidate: generateLocalFallbackCandidate({ context, policy }),
    fromModel: false,
  };
};
export const runNegotiationScenario = async ({
  name,
  buyerLimit,
  sellerLimit,
  publicReferencePrice,
  buyerProvider,
  sellerProvider,
  productCode = "1111",
}) => {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    typeof buyerLimit !== "bigint" ||
    buyerLimit < 1n ||
    typeof sellerLimit !== "bigint" ||
    sellerLimit < 1n ||
    !/^[1-9]\d{0,19}$/.test(publicReferencePrice) ||
    !/^\d{4}$/.test(productCode)
  ) {
    throw new Error("invalid negotiation evaluation scenario");
  }

  const buyerPolicy = { role: "buyer", maximumPrice: buyerLimit };
  const sellerPolicy = { role: "seller", minimumPrice: sellerLimit };
  let modelSelections = 0;

  const openingContext = {
    role: "buyer",
    productCode,
    round: 1,
    publicReferencePrice,
  };
  const opening = await chooseCandidate({
    provider: buyerProvider,
    context: openingContext,
    policy: buyerPolicy,
  });
  if (opening.fromModel) modelSelections += 1;
  if (opening.candidate === undefined || opening.candidate.action !== "offer") {
    return { name, result: "CANCELLED", rounds: 1, modelSelections };
  }
  let buyerOffer = opening.candidate.price;

  for (let round = 1; round <= 10; round += 1) {
    const sellerContext = {
      role: "seller",
      productCode,
      round,
      publicReferencePrice,
      currentOffer: { maker: "buyer", price: buyerOffer },
    };
    const sellerDecision = await chooseCandidate({
      provider: sellerProvider,
      context: sellerContext,
      policy: sellerPolicy,
    });
    if (sellerDecision.fromModel) modelSelections += 1;
    if (sellerDecision.candidate === undefined) {
      return { name, result: "CANCELLED", rounds: round, modelSelections };
    }
    if (sellerDecision.candidate.action === "accept") {
      return {
        name,
        result: "SETTLED",
        agreedAmount: sellerDecision.candidate.price,
        rounds: round,
        modelSelections,
      };
    }

    const buyerContext = {
      role: "buyer",
      productCode,
      round,
      publicReferencePrice,
      currentOffer: {
        maker: "seller",
        price: sellerDecision.candidate.price,
      },
    };
    const buyerDecision = await chooseCandidate({
      provider: buyerProvider,
      context: buyerContext,
      policy: buyerPolicy,
    });
    if (buyerDecision.fromModel) modelSelections += 1;
    if (buyerDecision.candidate === undefined) {
      return { name, result: "CANCELLED", rounds: round, modelSelections };
    }
    if (buyerDecision.candidate.action === "accept") {
      return {
        name,
        result: "SETTLED",
        agreedAmount: buyerDecision.candidate.price,
        rounds: round,
        modelSelections,
      };
    }
    buyerOffer = buyerDecision.candidate.price;
  }

  return { name, result: "CANCELLED", rounds: 10, modelSelections };
};
