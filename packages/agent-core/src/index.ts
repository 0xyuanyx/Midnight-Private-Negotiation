export type AgentRole = "buyer" | "seller";

export type PublicOffer = {
  maker: AgentRole;
  price: string;
};

export type PublicNegotiationContext = {
  role: AgentRole;
  productCode: string;
  round: number;
  currentOffer?: PublicOffer;
};

export type NegotiationCandidate =
  | { action: "offer"; price: string }
  | { action: "accept"; price: string };

export type CandidateProvider = {
  generateCandidates(
    context: PublicNegotiationContext,
  ): Promise<readonly NegotiationCandidate[]>;
};

export type LocalPolicy =
  | { role: "buyer"; maximumPrice: bigint }
  | { role: "seller"; minimumPrice: bigint };

const MAX_KRW = 18_446_744_073_709_551_615n;
const MAX_CANDIDATES = 5;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => key in value) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
};

const parsePrice = (value: unknown): bigint | undefined => {
  if (typeof value !== "string" || !/^[1-9]\d{0,19}$/.test(value)) {
    return undefined;
  }
  const price = BigInt(value);
  return price <= MAX_KRW ? price : undefined;
};

const validatePublicContext = (
  value: PublicNegotiationContext,
): PublicNegotiationContext => {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      ["role", "productCode", "round"],
      ["currentOffer"],
    ) ||
    (value.role !== "buyer" && value.role !== "seller") ||
    typeof value.productCode !== "string" ||
    !/^\d{4}$/.test(value.productCode) ||
    !Number.isInteger(value.round) ||
    value.round < 1 ||
    value.round > 10
  ) {
    throw new Error("invalid public negotiation context");
  }

  if (value.currentOffer !== undefined) {
    if (
      !isRecord(value.currentOffer) ||
      !hasExactKeys(value.currentOffer, ["maker", "price"]) ||
      (value.currentOffer.maker !== "buyer" &&
        value.currentOffer.maker !== "seller") ||
      value.currentOffer.maker === value.role ||
      parsePrice(value.currentOffer.price) === undefined
    ) {
      throw new Error("invalid public negotiation offer");
    }
  }
  return value;
};

const validateCandidates = (
  value: readonly NegotiationCandidate[],
): readonly NegotiationCandidate[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CANDIDATES) {
    throw new Error("candidate provider returned an invalid candidate count");
  }
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ["action", "price"]) ||
      (candidate.action !== "offer" && candidate.action !== "accept") ||
      parsePrice(candidate.price) === undefined
    ) {
      throw new Error("candidate provider returned an invalid candidate");
    }
  }
  return value;
};

const scalePrice = (price: bigint, basisPoints: bigint): string => {
  const scaled = (price * basisPoints) / 10_000n;
  const safe = scaled < 1n ? 1n : scaled > MAX_KRW ? MAX_KRW : scaled;
  return safe.toString();
};

const uniqueCandidates = (
  candidates: readonly NegotiationCandidate[],
): readonly NegotiationCandidate[] => {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.action}:${candidate.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const createDeterministicMockProvider = (
  options: { publicReferencePriceKrw?: string } = {},
): CandidateProvider => {
  const referencePrice = parsePrice(
    options.publicReferencePriceKrw ?? "100000",
  );
  if (referencePrice === undefined) {
    throw new Error("mock reference price must be a positive uint64 amount");
  }

  return {
    async generateCandidates(
      rawContext: PublicNegotiationContext,
    ): Promise<readonly NegotiationCandidate[]> {
      const context = validatePublicContext(rawContext);
      if (context.currentOffer === undefined) {
        if (context.role !== "buyer") {
          throw new Error("only Buyer can create the opening mock offer");
        }
        return uniqueCandidates(
          [10_000n, 9_500n, 9_000n, 8_500n, 8_000n].map(
            (basisPoints): NegotiationCandidate => ({
              action: "offer",
              price: scalePrice(referencePrice, basisPoints),
            }),
          ),
        );
      }

      const accept: NegotiationCandidate = {
        action: "accept",
        price: context.currentOffer.price,
      };
      const counterBasisPoints =
        context.role === "buyer"
          ? ([10_000n, 9_500n, 9_000n, 8_000n] as const)
          : ([10_000n, 10_500n, 11_000n, 11_500n] as const);
      return uniqueCandidates([
        accept,
        ...counterBasisPoints.map(
          (basisPoints): NegotiationCandidate => ({
            action: "offer",
            price: scalePrice(referencePrice, basisPoints),
          }),
        ),
      ]);
    },
  };
};

export const policyAllows = (
  policy: LocalPolicy,
  rawContext: PublicNegotiationContext,
  candidate: NegotiationCandidate,
): boolean => {
  const context = validatePublicContext(rawContext);
  const price = parsePrice(candidate.price);
  if (price === undefined || context.role !== policy.role) return false;

  if (candidate.action === "accept") {
    if (
      context.currentOffer === undefined ||
      candidate.price !== context.currentOffer.price
    ) {
      return false;
    }
  } else if (candidate.action !== "offer") {
    return false;
  }

  return policy.role === "buyer"
    ? price <= policy.maximumPrice
    : price >= policy.minimumPrice;
};

export const generateAllowedCandidate = async (input: {
  provider: CandidateProvider;
  context: PublicNegotiationContext;
  policy: LocalPolicy;
  maxStatelessRequests?: number;
}): Promise<NegotiationCandidate | undefined> => {
  const context = validatePublicContext(input.context);
  const maxStatelessRequests = input.maxStatelessRequests ?? 3;
  if (
    !Number.isInteger(maxStatelessRequests) ||
    maxStatelessRequests < 1 ||
    maxStatelessRequests > 3
  ) {
    throw new Error("stateless request limit must be between one and three");
  }

  for (let request = 0; request < maxStatelessRequests; request += 1) {
    try {
      const providerContext: PublicNegotiationContext = {
        role: context.role,
        productCode: context.productCode,
        round: context.round,
        ...(context.currentOffer === undefined
          ? {}
          : {
              currentOffer: {
                maker: context.currentOffer.maker,
                price: context.currentOffer.price,
              },
            }),
      };
      const candidates = validateCandidates(
        await input.provider.generateCandidates(providerContext),
      );
      const allowed = candidates.find((candidate) =>
        policyAllows(input.policy, context, candidate),
      );
      if (allowed !== undefined) return allowed;
    } catch {
      // Provider failures and rejected candidates are intentionally not exposed.
    }
  }
  return undefined;
};
