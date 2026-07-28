import {
  createOpenAIResponsesProvider,
} from "../packages/agent-core/dist/index.js";
import { runNegotiationScenario } from "./openai-negotiation-eval.mjs";

const apiKey =
  process.env.OPENAI_API_KEY?.trim() ||
  process.env.MEMO_OPENAI_API_KEY?.trim();
if (apiKey === undefined || apiKey.length === 0) {
  throw new Error(
    "Set MEMO_OPENAI_API_KEY or OPENAI_API_KEY before running the live evaluation",
  );
}

const model = process.env.OPENAI_NEGOTIATION_MODEL?.trim() || "gpt-5.6-sol";
const forbiddenFieldPattern =
  /maximumPrice|minimumPrice|commitment|randomness|secret|wallet|PolicyGuard|retry/i;
let apiRequests = 0;
const httpStatuses = [];

const auditedFetch = async (url, init) => {
  const body = JSON.parse(String(init?.body));
  if (body.store !== false || body.previous_response_id !== undefined) {
    throw new Error("live request is not stateless");
  }
  const publicInput = JSON.parse(body.input);
  if (forbiddenFieldPattern.test(JSON.stringify(publicInput))) {
    throw new Error("live request contains a forbidden private field");
  }
  const allowedKeys =
    publicInput.currentOffer === undefined
      ? ["productCode", "publicReferencePrice", "role", "round"]
      : [
          "currentOffer",
          "productCode",
          "publicReferencePrice",
          "role",
          "round",
        ];
  if (
    JSON.stringify(Object.keys(publicInput).sort()) !==
    JSON.stringify(allowedKeys.sort())
  ) {
    throw new Error("live request contains an unexpected public field");
  }

  apiRequests += 1;
  const response = await fetch(url, init);
  httpStatuses.push(response.status);
  return response;
};

const provider = () =>
  createOpenAIResponsesProvider({
    apiKey,
    model,
    fetchImpl: auditedFetch,
    timeoutMs: 60_000,
  });

const scenarios = [
  {
    name: "happy-100k",
    buyerLimit: 110000n,
    sellerLimit: 90000n,
    publicReferencePrice: "100000",
  },
  {
    name: "happy-800k",
    buyerLimit: 900000n,
    sellerLimit: 700000n,
    publicReferencePrice: "800000",
  },
  {
    name: "cancelled-gap",
    buyerLimit: 75000n,
    sellerLimit: 90000n,
    publicReferencePrice: "80000",
  },
];

const startedAt = Date.now();
const results = [];
for (const scenario of scenarios) {
  results.push(
    await runNegotiationScenario({
      ...scenario,
      buyerProvider: provider(),
      sellerProvider: provider(),
    }),
  );
}

if (
  results[0]?.result !== "SETTLED" ||
  results[1]?.result !== "SETTLED" ||
  results[2]?.result !== "CANCELLED"
) {
  throw new Error("live negotiation outcomes did not match the scenario policy");
}
const modelSelections = results.reduce(
  (sum, result) => sum + result.modelSelections,
  0,
);
if (apiRequests === 0 || modelSelections === 0 || httpStatuses.some((s) => s !== 200)) {
  throw new Error(
    `OpenAI provider was not exercised successfully (requests=${apiRequests}, selections=${modelSelections}, statuses=${httpStatuses.join(",")})`,
  );
}

console.log(
  JSON.stringify(
    {
      model,
      apiRequests,
      modelSelections,
      elapsedMs: Date.now() - startedAt,
      scenarios: results,
      privacyAudit: "passed",
    },
    null,
    2,
  ),
);
