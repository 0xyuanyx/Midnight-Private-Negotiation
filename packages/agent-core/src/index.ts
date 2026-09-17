export type AgentRole = "buyer" | "seller";

export type PublicOffer = {
  maker: AgentRole;
  price: string;
};

export type PublicNegotiationContext = {
  role: AgentRole;
  productCode: string;
  round: number;
  publicReferencePrice?: string;
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

export type NegotiationModelRequest = {
  instructions: string;
  input: string;
  store: false;
};

export type OpenAIResponsesProviderOptions = {
  apiKey: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type LocalPolicy =
  | { role: "buyer"; maximumPrice: bigint }
  | { role: "seller"; minimumPrice: bigint };

const MAX_KRW = 18_446_744_073_709_551_615n;
const MAX_CANDIDATES = 5;
export const PRICE_INCREMENT_KRW = 250n;
export const NEGOTIATION_PROMPT_VERSION = "2026-07-28.v3";

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

export const isOfferPriceIncrementValid = (rawPrice: string): boolean => {
  const price = parsePrice(rawPrice);
  return price !== undefined && price % PRICE_INCREMENT_KRW === 0n;
};

const validatePublicContext = (
  value: PublicNegotiationContext,
): PublicNegotiationContext => {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      ["role", "productCode", "round"],
      ["publicReferencePrice", "currentOffer"],
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

  if (
    value.publicReferencePrice !== undefined &&
    parsePrice(value.publicReferencePrice) === undefined
  ) {
    throw new Error("invalid public negotiation reference price");
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

const COMMON_NEGOTIATION_INSTRUCTIONS = `
당신은 Midnight 비공개 가격 협상 DApp의 후보 생성 에이전트다.
당신은 거래를 확정하거나 정책을 집행하지 않는다. 공개 협상 정보만 보고 다음 행동 후보를 만들며, 실제 전송·수락 가능 여부는 각 사용자 기기 안의 로컬 PolicyGuard가 최종 결정한다.

[절대적인 신뢰 경계]
- 입력으로 허용되는 정보는 role, productCode, round, publicReferencePrice, currentOffer뿐이다.
- publicReferencePrice는 상품의 공개 기준가이며 어느 당사자의 비공개 한도도 아니다.
- 구매자 최대 한도, 판매자 최소 금액, commitment 난수, 비밀키, 지갑 정보, PolicyGuard 판정, 폐기된 후보, 폐기 횟수, 재요청 횟수는 알 수 없으며 요청하거나 추측해서도 안 된다.
- 이전 응답이나 숨겨진 대화 상태가 존재한다고 가정하지 않는다. 매 요청은 완전히 독립적인 stateless 요청이다.
- 현재 요청에 없는 정보와 상대방의 비공개 조건을 만들어내거나 사실처럼 표현하지 않는다.

[협상 원칙]
- 한 번의 후보 실패로 협상이 불필요하게 끝나지 않도록 서로 다른 가격의 후보를 1개 이상 5개 이하로 제시한다.
- currentOffer가 있으면 첫 후보는 그 가격을 그대로 수락하는 accept 후보로 둔다. 뒤에는 역할에 맞는 신중한 counter offer 후보를 가까운 가격부터 단계적으로 배치한다.
- 양보 폭은 갑작스럽게 크게 바꾸지 말고, 공개된 현재 제안을 기준으로 점진적으로 조정한다.
- exact price를 포함한 모든 후보는 양의 정수 KRW 문자열이어야 한다. 쉼표, 소수점, 통화기호, 단위는 넣지 않는다.
- 모든 offer 가격은 반드시 250 KRW 단위여야 한다. 즉 250으로 나누어떨어져야 한다.
- 가능한 경우 90,750, 93,250, 96,500처럼 자연스러운 값을 사용하고 1,000원 단위에만 반복적으로 맞추지 않는다.
- accept는 currentOffer가 있을 때에만 가능하며 price는 currentOffer.price와 정확히 같아야 한다.
- 최대 협상 라운드는 10이다. 현재 round 안에서 가능한 후보만 만들고 종료 여부를 스스로 선언하지 않는다.
- 후보는 제안일 뿐이다. 어떤 후보가 허용될 것인지, 합의가 가능한지, 상대 한도와 겹치는지는 단정하지 않는다.

[비공개 조건 비암시]
- "최대 한도", "최소 금액", "마지노선", "최종 제안", "마지막 가격", "더는 올릴 수 없음", "더는 내릴 수 없음", "예산이 부족함", "원가 이하"처럼 비공개 경계를 직접 또는 간접적으로 암시하는 표현을 생성하지 않는다.
- 특정 후보가 통과·거절되었다는 사실이나 재시도 중이라는 사실을 다음 판단의 근거로 삼지 않는다.
- 후보 가격의 배열이나 간격을 비밀 한도의 부호화 수단으로 사용하지 않는다.

[출력 계약]
- 설명, 인사말, 협상 대사, 추론, Markdown, 코드 블록을 출력하지 않는다.
- 오직 {"candidates":[...]} 형태의 JSON 객체 하나만 출력한다.
- 각 원소는 {"action":"offer","price":"90750"} 또는 {"action":"accept","price":"90750"} 형식이며 다른 필드는 넣지 않는다.
`.trim();

const BUYER_NEGOTIATION_INSTRUCTIONS = `
[BUYER 역할]
- 구매자의 목표는 성급하게 높은 가격을 확정하지 않으면서도, 합의 가능성이 있는 거래를 놓치지 않는 것이다.
- 첫 공개 제안은 보통 publicReferencePrice의 약 90.75%에서 시작하고 250 KRW 단위로 맞춘다. 이후 후보는 공개 기준가 방향으로 점진적으로 배치한다.
- 판매자의 공개 제안이 있으면 수락 후보를 먼저 만들고, 그보다 낮은 counter offer 후보들을 현재 제안에 가까운 값부터 점진적으로 만든다.
- 공개 제안과 라운드 흐름을 존중하며 가격을 올릴 때는 작은 단계로 신중하게 조정한다.
- 구매자의 실제 최대 한도를 알고 있는 것처럼 말하거나, 후보 가격을 최대 한도 또는 최종 가격이라고 설명하지 않는다.
- seller의 비공개 최소 금액을 추정하거나 떠보는 표현을 만들지 않는다.
`.trim();

const SELLER_NEGOTIATION_INSTRUCTIONS = `
[SELLER 역할]
- 판매자의 목표는 성급하게 낮은 가격을 확정하지 않으면서도, 합의 가능성이 있는 거래를 놓치지 않는 것이다.
- 구매자의 공개 제안이 있으면 수락 후보를 먼저 만들고, 그보다 높은 counter offer 후보들을 현재 제안에 가까운 값부터 점진적으로 만든다.
- 공개 제안과 라운드 흐름을 존중하며 가격을 내릴 때는 작은 단계로 신중하게 조정한다.
- 판매자의 실제 최소 금액을 알고 있는 것처럼 말하거나, 후보 가격을 최소 금액 또는 최종 가격이라고 설명하지 않는다.
- buyer의 비공개 최대 한도를 추정하거나 떠보는 표현을 만들지 않는다.
`.trim();

export const buildNegotiationAgentInstructions = (
  role: AgentRole,
): string => {
  if (role !== "buyer" && role !== "seller") {
    throw new Error("invalid negotiation agent role");
  }
  return [
    `prompt_version=${NEGOTIATION_PROMPT_VERSION}`,
    COMMON_NEGOTIATION_INSTRUCTIONS,
    role === "buyer"
      ? BUYER_NEGOTIATION_INSTRUCTIONS
      : SELLER_NEGOTIATION_INSTRUCTIONS,
  ].join("\n\n");
};

export const createNegotiationModelRequest = (
  rawContext: PublicNegotiationContext,
): NegotiationModelRequest => {
  const context = validatePublicContext(rawContext);
  const publicInput: PublicNegotiationContext = {
    role: context.role,
    productCode: context.productCode,
    round: context.round,
    ...(context.publicReferencePrice === undefined
      ? {}
      : { publicReferencePrice: context.publicReferencePrice }),
    ...(context.currentOffer === undefined
      ? {}
      : {
          currentOffer: {
            maker: context.currentOffer.maker,
            price: context.currentOffer.price,
          },
        }),
  };
  return {
    instructions: buildNegotiationAgentInstructions(context.role),
    input: JSON.stringify(publicInput),
    store: false,
  };
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
      typeof candidate.price !== "string" ||
      parsePrice(candidate.price) === undefined ||
      (candidate.action === "offer" &&
        !isOfferPriceIncrementValid(candidate.price))
    ) {
      throw new Error("candidate provider returned an invalid candidate");
    }
  }
  return value;
};

const NEGOTIATION_CANDIDATE_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      minItems: 1,
      maxItems: MAX_CANDIDATES,
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["offer", "accept"] },
          price: { type: "string", pattern: "^[1-9][0-9]{0,19}$" },
        },
        required: ["action", "price"],
        additionalProperties: false,
      },
    },
  },
  required: ["candidates"],
  additionalProperties: false,
} as const;

const extractResponseOutputText = (value: unknown): string => {
  if (
    !isRecord(value) ||
    value.status !== "completed" ||
    !Array.isArray(value.output)
  ) {
    throw new Error("OpenAI response did not complete");
  }

  const outputText = value.output
    .flatMap((item) =>
      isRecord(item) && item.type === "message" && Array.isArray(item.content)
        ? item.content
        : [],
    )
    .filter(
      (part): part is Record<string, unknown> =>
        isRecord(part) &&
        part.type === "output_text" &&
        typeof part.text === "string",
    )
    .map((part) => part.text as string)
    .join("");
  if (outputText.length === 0) {
    throw new Error("OpenAI response did not contain output text");
  }
  return outputText;
};

export const createOpenAIResponsesProvider = (
  options: OpenAIResponsesProviderOptions,
): CandidateProvider => {
  if (typeof options.apiKey !== "string" || options.apiKey.trim().length === 0) {
    throw new Error("OpenAI API key is required");
  }
  const model = options.model?.trim() || "gpt-5.6-sol";
  const endpoint =
    options.endpoint?.trim() || "https://api.openai.com/v1/responses";
  const timeoutMs = options.timeoutMs ?? 45_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new Error("OpenAI request timeout must be between 1000 and 120000 ms");
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async generateCandidates(
      context: PublicNegotiationContext,
    ): Promise<readonly NegotiationCandidate[]> {
      const request = createNegotiationModelRequest(context);
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions: request.instructions,
          input: request.input,
          store: request.store,
          reasoning: { effort: "low" },
          max_output_tokens: 700,
          text: {
            format: {
              type: "json_schema",
              name: "negotiation_candidates",
              strict: true,
              schema: NEGOTIATION_CANDIDATE_SCHEMA,
            },
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`OpenAI Responses request failed with ${response.status}`);
      }

      const parsed = JSON.parse(
        extractResponseOutputText(await response.json()),
      ) as unknown;
      if (
        !isRecord(parsed) ||
        !hasExactKeys(parsed, ["candidates"]) ||
        !Array.isArray(parsed.candidates)
      ) {
        throw new Error("OpenAI response has an invalid candidate envelope");
      }
      return validateCandidates(
        parsed.candidates as readonly NegotiationCandidate[],
      );
    },
  };
};

const roundDownToPriceIncrement = (price: bigint): bigint | undefined => {
  const rounded = (price / PRICE_INCREMENT_KRW) * PRICE_INCREMENT_KRW;
  return rounded >= PRICE_INCREMENT_KRW && rounded <= MAX_KRW
    ? rounded
    : undefined;
};

const roundUpToPriceIncrement = (price: bigint): bigint | undefined => {
  const remainder = price % PRICE_INCREMENT_KRW;
  const rounded =
    remainder === 0n ? price : price + PRICE_INCREMENT_KRW - remainder;
  return rounded >= PRICE_INCREMENT_KRW && rounded <= MAX_KRW
    ? rounded
    : undefined;
};

export const localTargetPrice = (
  policy: LocalPolicy,
  round: number,
): bigint | undefined => {
  if (!Number.isInteger(round) || round < 1 || round > 10) return undefined;
  const progress = BigInt(round - 1);
  if (policy.role === "buyer") {
    const basisPoints = 9_000n + (progress * 1_000n) / 9n;
    return roundDownToPriceIncrement(
      (policy.maximumPrice * basisPoints) / 10_000n,
    );
  }
  const basisPoints = 11_500n - (progress * 1_500n) / 9n;
  return roundUpToPriceIncrement(
    (policy.minimumPrice * basisPoints) / 10_000n,
  );
};

const scalePrice = (price: bigint, basisPoints: bigint): string => {
  const scaled = (price * basisPoints) / 10_000n;
  const safe = scaled < 1n ? 1n : scaled > MAX_KRW ? MAX_KRW : scaled;
  return (roundDownToPriceIncrement(safe) ?? PRICE_INCREMENT_KRW).toString();
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
  const defaultReferencePrice = parsePrice(
    options.publicReferencePriceKrw ?? "100000",
  );
  if (defaultReferencePrice === undefined) {
    throw new Error("mock reference price must be a positive uint64 amount");
  }

  return {
    async generateCandidates(
      rawContext: PublicNegotiationContext,
    ): Promise<readonly NegotiationCandidate[]> {
      const context = validatePublicContext(rawContext);
      const referencePrice =
        context.publicReferencePrice === undefined
          ? defaultReferencePrice
          : parsePrice(context.publicReferencePrice);
      if (referencePrice === undefined) {
        throw new Error("mock reference price must be a positive uint64 amount");
      }
      if (context.currentOffer === undefined) {
        if (context.role !== "buyer") {
          throw new Error("only Buyer can create the opening mock offer");
        }
        return uniqueCandidates(
          [9_075n, 9_325n, 9_575n, 9_825n, 10_000n].map(
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
          ? ([10_000n, 9_725n, 9_475n, 9_075n] as const)
          : ([10_000n, 10_525n, 11_075n, 11_525n] as const);
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

export const createCandidateProviderFromEnvironment = (
  options: {
    environment?: Readonly<Record<string, string | undefined>>;
    fetchImpl?: typeof fetch;
  } = {},
): CandidateProvider => {
  const environment = options.environment ?? process.env;
  const provider = environment.NEGOTIATION_AI_PROVIDER?.trim() || "mock";
  const publicReferencePriceKrw =
    environment.NEGOTIATION_REFERENCE_PRICE_KRW?.trim() || "100000";

  if (provider === "mock") {
    return createDeterministicMockProvider({ publicReferencePriceKrw });
  }
  if (provider !== "openai") {
    throw new Error(`unsupported negotiation AI provider: ${provider}`);
  }

  const apiKey =
    environment.OPENAI_API_KEY?.trim() ||
    environment.MEMO_OPENAI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("OpenAI API key is required for the openai provider");
  }
  return createOpenAIResponsesProvider({
    apiKey,
    model: environment.OPENAI_NEGOTIATION_MODEL?.trim() || "gpt-5.6-sol",
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  });
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
  } else if (
    candidate.action !== "offer" ||
    !isOfferPriceIncrementValid(candidate.price)
  ) {
    return false;
  }

  return policy.role === "buyer"
    ? price <= policy.maximumPrice
    : price >= policy.minimumPrice;
};

export const strategyAllows = (
  policy: LocalPolicy,
  rawContext: PublicNegotiationContext,
  candidate: NegotiationCandidate,
): boolean => {
  const context = validatePublicContext(rawContext);
  if (!policyAllows(policy, context, candidate)) return false;
  const price = parsePrice(candidate.price);
  const target = localTargetPrice(policy, context.round);
  if (price === undefined || target === undefined) return false;
  return policy.role === "buyer" ? price <= target : price >= target;
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
        ...(context.publicReferencePrice === undefined
          ? {}
          : { publicReferencePrice: context.publicReferencePrice }),
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
        strategyAllows(input.policy, context, candidate),
      );
      if (allowed !== undefined) return allowed;
    } catch {
      // Provider failures and rejected candidates are intentionally not exposed.
    }
  }
  return undefined;
};

export const generateLocalFallbackCandidate = (input: {
  context: PublicNegotiationContext;
  policy: LocalPolicy;
}): NegotiationCandidate | undefined => {
  const context = validatePublicContext(input.context);
  if (context.role !== input.policy.role) return undefined;

  if (context.currentOffer !== undefined) {
    const acceptance: NegotiationCandidate = {
      action: "accept",
      price: context.currentOffer.price,
    };
    if (strategyAllows(input.policy, context, acceptance)) return acceptance;
  } else if (input.policy.role === "seller") {
    return undefined;
  }

  const price = localTargetPrice(input.policy, context.round);
  if (price === undefined) return undefined;
  const offer: NegotiationCandidate = {
    action: "offer",
    price: price.toString(),
  };
  return strategyAllows(input.policy, context, offer) ? offer : undefined;
};
