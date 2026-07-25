import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';
import { getNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import { MidnightBech32m, UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import type { WalletContext } from '../api';

export const fundWallet = async (funder: WalletContext, receiverAddress: string, amount: bigint): Promise<string> => {
  if (amount <= 0n) {
    throw new Error('wallet funding amount must be positive');
  }

  const receiver = MidnightBech32m.parse(receiverAddress).decode(UnshieldedAddress, getNetworkId());
  const recipe = await funder.wallet.transferTransaction(
    [
      {
        type: 'unshielded',
        outputs: [{ type: unshieldedToken().raw, receiverAddress: receiver, amount }],
      },
    ],
    {
      shieldedSecretKeys: funder.shieldedSecretKeys,
      dustSecretKey: funder.dustSecretKey,
    },
    { ttl: new Date(Date.now() + 30 * 60 * 1000) },
  );
  const signedRecipe = await funder.wallet.signRecipe(recipe, (payload) => funder.unshieldedKeystore.signData(payload));
  const transaction = await funder.wallet.finalizeRecipe(signedRecipe);
  return await funder.wallet.submitTransaction(transaction);
};
