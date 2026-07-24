import type { IsolationMessage } from './protocol';

type Proposal = Extract<IsolationMessage, { type: 'PROPOSAL' }>;
type PriceOpening = Extract<IsolationMessage, { type: 'PRICE_OPENING' }>;

export const assertDealBinding = (publicDealId: string, proposal: Proposal, opening?: PriceOpening): void => {
  if (proposal.dealId !== publicDealId) {
    throw new Error('proposal does not match public deal');
  }
  if (
    opening !== undefined &&
    (opening.dealId !== publicDealId || opening.dealId !== proposal.dealId || opening.price !== proposal.price)
  ) {
    throw new Error('price opening does not match accepted proposal');
  }
};
