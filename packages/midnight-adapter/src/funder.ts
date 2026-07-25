import {
  GENESIS_MINT_WALLET_SEED,
  prepareFundedWallet,
  fundWallet,
  type MidnightLocalConfig,
  useUndeployedNetwork,
} from "./index.js";

type FunderInput = {
  config: MidnightLocalConfig;
  recipients: string[];
  amount: string;
};

const input = JSON.parse(process.env.MIDNIGHT_FUNDER_INPUT ?? "") as FunderInput;
if (
  !Array.isArray(input.recipients) ||
  input.recipients.length !== 2 ||
  !input.recipients.every((address) => typeof address === "string") ||
  typeof input.amount !== "string" ||
  !/^[1-9]\d*$/u.test(input.amount)
) {
  throw new Error("invalid Midnight funder input");
}

useUndeployedNetwork();
const wallet = await prepareFundedWallet(
  input.config,
  GENESIS_MINT_WALLET_SEED,
);
try {
  for (const address of input.recipients) {
    await fundWallet(wallet, address, BigInt(input.amount));
  }
  process.send?.({ type: "FUNDING_COMPLETE" });
} finally {
  await wallet.wallet.stop();
}
